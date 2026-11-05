// 订单供给规则：午高峰 + 空间聚簇（v1.4），并预留时限收紧开关（默认关闭）。
// 约束：src/engine/ 只读；本模块只对新生订单和初始在库单做后处理，
// 由 rider_client 与 verify_replay 共用，保证回放一致。
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(HERE, '..', 'engine');
const { SeededRNG } = await import(pathToFileURL(path.join(ENGINE, 'utils', 'seeded-rng.js')).href);
const { calculateTotalFee } = await import(pathToFileURL(path.join(ENGINE, 'core', 'fee-calculator.js')).href);

export const DEFAULT_DISTRIBUTION = {
  enabled: false,
  peak: { start: 690, end: 780, multiplier: 3 },
  cluster: { hotShare: 0.7, restaurantHot: 6, supermarketHot: 2, pharmacyHot: 2, deliveryHot: 8 },
  timeLimit: { enabled: false, scale: 1, cutMinutes: 0, minMinutes: 12 },
};

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function mergeDistribution(raw) {
  const cfg = raw || {};
  const tl = cfg.timeLimit || {};
  return {
    enabled: cfg.enabled === undefined ? DEFAULT_DISTRIBUTION.enabled : cfg.enabled !== false,
    peak: Object.assign({}, DEFAULT_DISTRIBUTION.peak, cfg.peak || {}),
    cluster: Object.assign({}, DEFAULT_DISTRIBUTION.cluster, cfg.cluster || {}),
    timeLimit: {
      enabled: tl.enabled === undefined ? DEFAULT_DISTRIBUTION.timeLimit.enabled : tl.enabled !== false,
      scale: Math.min(1, Math.max(0.1, num(tl.scale, DEFAULT_DISTRIBUTION.timeLimit.scale))),
      cutMinutes: Math.max(0, num(tl.cutMinutes, DEFAULT_DISTRIBUTION.timeLimit.cutMinutes)),
      minMinutes: Math.max(0, num(tl.minMinutes, DEFAULT_DISTRIBUTION.timeLimit.minMinutes)),
    },
  };
}

export function engineTimeLimit(distance) {
  return distance < 3 ? 20 : 20 + (distance - 3) * 3;
}

export function createDistribution(opts) {
  const nodes = opts.nodes;
  const seed = opts.seed >>> 0;
  const cfg = mergeDistribution(opts.config);
  const rng = new SeededRNG((seed ^ 0x686f7473) >>> 0);

  const pickupPool = { restaurant: [], supermarket: [], pharmacy: [] };
  const deliveryPool = [];
  for (const node of nodes.values()) {
    if (pickupPool[node.type]) pickupPool[node.type].push(node.id);
    else if (node.type === 'residential' || node.type === 'office') deliveryPool.push(node.id);
  }

  const pickHot = (arr, k) => {
    const copy = arr.slice().sort();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = rng.nextInt(0, i);
      const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy.slice(0, Math.max(1, Math.min(k, copy.length)));
  };

  const hotPickup = {
    restaurant: pickHot(pickupPool.restaurant, cfg.cluster.restaurantHot),
    supermarket: pickHot(pickupPool.supermarket, cfg.cluster.supermarketHot),
    pharmacy: pickHot(pickupPool.pharmacy, cfg.cluster.pharmacyHot),
  };
  const hotDelivery = pickHot(deliveryPool, cfg.cluster.deliveryHot);

  return {
    config: cfg,
    hotPickup,
    hotDelivery,
    // 空间分布关闭时不影响基础供给。
    multiplierAt(minute) {
      if (!cfg.enabled) return 1;
      const inPeak = minute >= cfg.peak.start && minute < cfg.peak.end;
      return inPeak ? Math.max(1, Math.floor(cfg.peak.multiplier)) : 1;
    },
    // timeLimit.enabled=false 时严格等于引擎基准。
    adjustedTimeLimit(distance) {
      if (!cfg.timeLimit.enabled) return engineTimeLimit(distance);
      const tightened = engineTimeLimit(distance) * cfg.timeLimit.scale - cfg.timeLimit.cutMinutes;
      return Math.max(cfg.timeLimit.minMinutes, tightened);
    },
    applyTimeLimit(order) {
      if (!cfg.timeLimit.enabled) return false;
      const next = this.adjustedTimeLimit(order.distance);
      if (Math.abs(next - order.timeLimit) < 1e-9) return false;
      order.timeLimit = next;
      return true;
    },
    applyToExisting(sim) {
      if (!cfg.timeLimit.enabled) return 0;
      let n = 0;
      for (const order of sim.getAvailableOrders()) if (this.applyTimeLimit(order)) n++;
      return n;
    },
    redistribute(order, pathfinder) {
      let changed = false;
      if (cfg.enabled) {
        const share = cfg.cluster.hotShare;
        const origPickup = nodes.get(order.pickupLocation);
        const pool = origPickup ? hotPickup[origPickup.type] : null;
        let nextPickup = order.pickupLocation;
        let nextDelivery = order.deliveryLocation;

        if (pool && pool.length && rng.nextFloat() < share) {
          nextPickup = pool[rng.nextInt(0, pool.length - 1)];
        }
        if (hotDelivery.length && rng.nextFloat() < share) {
          const cand = hotDelivery[rng.nextInt(0, hotDelivery.length - 1)];
          if (cand !== nextPickup) nextDelivery = cand;
        }
        if (nextPickup !== order.pickupLocation || nextDelivery !== order.deliveryLocation) {
          const res = pathfinder.calculateDistance(nextPickup, nextDelivery);
          if (res && res.distance > 0) {
            order.pickupLocation = nextPickup;
            order.deliveryLocation = nextDelivery;
            order.distance = res.distance;
            order.deliveryFee = calculateTotalFee(res.distance, order.itemPrice, 0);
            order.timeLimit = engineTimeLimit(res.distance);
            changed = true;
          }
        }
      }
      if (this.applyTimeLimit(order)) changed = true;
      return changed;
    },
    spawnBatch(sim, minute) {
      const times = this.multiplierAt(minute);
      const applyRules = cfg.enabled || cfg.timeLimit.enabled;
      for (let t = 0; t < times; t++) {
        const pre = new Set(sim.getAvailableOrders().map(o => o.id));
        sim.advanceSimulation();
        if (!applyRules) continue;
        const pathfinder = cfg.enabled ? sim.getPathfinder() : null;
        for (const o of sim.getAvailableOrders()) {
          if (pre.has(o.id)) continue;
          this.redistribute(o, pathfinder);
        }
      }
      return times;
    },
  };
}

// 订单分布改造（v1.4）：午高峰 + 空间聚簇。
//
// 设计约束：src/engine/ 是第三方只读组件，本模块**不修改引擎逻辑**，
// 而是在客户端对"新生订单"做重分布，并由 rider_client 与 verify_replay 共用，
// 保证两边的订单流完全一致（回放可核验）。
//
// 分布形态（对齐真实同城配送）：
//   - 店铺成簇：餐饮/超市/药店各自有一批"热点"节点
//   - 住户成片：写字楼/住宅有一批"热点"片区
//   - 店簇与片区是多对多：同一批单可能来自不同店、去往不同片区
//   - 午高峰 11:30-13:00 供给倍率提升
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(HERE, '..', 'engine');

const { SeededRNG } = await import(pathToFileURL(path.join(ENGINE, 'utils', 'seeded-rng.js')).href);
const { calculateTotalFee } = await import(pathToFileURL(path.join(ENGINE, 'core', 'fee-calculator.js')).href);

export const DEFAULT_DISTRIBUTION = {
  enabled: false,
  peak: { start: 690, end: 780, multiplier: 3 },
  cluster: {
    hotShare: 0.7,
    restaurantHot: 6,
    supermarketHot: 2,
    pharmacyHot: 2,
    deliveryHot: 8,
  },
};

export function mergeDistribution(raw) {
  const cfg = raw || {};
  return {
    enabled: cfg.enabled === undefined ? DEFAULT_DISTRIBUTION.enabled : cfg.enabled !== false,
    peak: Object.assign({}, DEFAULT_DISTRIBUTION.peak, cfg.peak || {}),
    cluster: Object.assign({}, DEFAULT_DISTRIBUTION.cluster, cfg.cluster || {}),
  };
}

// 与引擎 order-generator.calculateTimeLimit 保持一致
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
    // 该时刻应生成几批（午高峰倍率）
    multiplierAt(minute) {
      if (!cfg.enabled) return 1;
      const inPeak = minute >= cfg.peak.start && minute < cfg.peak.end;
      return inPeak ? Math.max(1, Math.floor(cfg.peak.multiplier)) : 1;
    },
    // 把一张新单的取送点按概率拉进热点集合，并重算距离/费用/时限。
    redistribute(order, pathfinder) {
      if (!cfg.enabled) return false;
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

      if (nextPickup === order.pickupLocation && nextDelivery === order.deliveryLocation) return false;

      const res = pathfinder.calculateDistance(nextPickup, nextDelivery);
      if (!res || !(res.distance > 0)) return false;

      order.pickupLocation = nextPickup;
      order.deliveryLocation = nextDelivery;
      order.distance = res.distance;
      order.deliveryFee = calculateTotalFee(res.distance, order.itemPrice, 0);
      order.timeLimit = engineTimeLimit(res.distance);
      return true;
    },
    // 一次"生单批"：按倍率重复调用引擎，并对新生订单做重分布
    spawnBatch(sim, minute) {
      const times = this.multiplierAt(minute);
      let created = 0;
      for (let t = 0; t < times; t++) {
        const pre = new Set(sim.getAvailableOrders().map(o => o.id));
        sim.advanceSimulation();
        if (!cfg.enabled) continue;
        for (const o of sim.getAvailableOrders()) {
          if (pre.has(o.id)) continue;
          created++;
          this.redistribute(o, sim.getPathfinder());
        }
      }
      return times;
    },
  };
}

// 物理界与锚值标定：给定种子，算出该场景“理论上限”的三种口径。
// 用法：node tools/bounds.mjs [--seed 12345 | --seed-index 1] [--protocol runs/<名>/protocol.json] [--json]
// 口径（MPK = 2 / 速度倍率 分钟/km，即畅通每公里耗时）：
//   A 合单数学硬界  每单按双单顺路折半计 0.5·MPK·d + 3 分钟（空驶/容量/时限/电量全放开）
//   B 单程零空驶界  每单计载货单程 MPK·d + 3 分钟（假设店与上一单终点无缝衔接）
//   C 现实路由界    每单计 MPK·(d + 1.5) + 3 分钟（送完平均再骑 1.5km 去下一家店）
// 供给与客户端一致：每 arrival.interval_min 分钟一批，并套用 distribution（午高峰 + 空间聚簇，v1.4），
// 走和 rider_client / verify_replay 同一个 createDistribution，所以“该种子这一版供给”的界才是对的。
//   --protocol   用该次运行当时生效的 distribution 配置（评分时用，保证和那一局的供给一致）；缺省读 configs/benchmark.json
//   --seed-index 由脚本从 $SR_SEEDS（缺省 ../.sr-seeds/seeds.json）取明文，人不接触；输出里不带种子明文
//   --json       只输出一行 JSON（供 src/scoring 调用）
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));          // tools
const ROOT = path.resolve(HERE, '..');
register(pathToFileURL(path.join(ROOT, 'src', 'engine', 'loader.mjs')).href);
const { Simulator } = await import(pathToFileURL(path.join(ROOT, 'src', 'engine', 'core', 'simulator.js')).href);
const { calculateTimeSlotFee } = await import(pathToFileURL(path.join(ROOT, 'src', 'engine', 'core', 'fee-calculator.js')).href);
const { createDistribution } = await import(pathToFileURL(path.join(ROOT, 'src', 'client', 'order_distribution.mjs')).href);

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = k => process.argv.includes('--' + k);
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf-8'));

const CFG = readJson(path.join(ROOT, 'configs', 'benchmark.json'));
const SC = CFG.scene || {}, AR = CFG.arrival || {};
let seedIndex = null;
let SEED;
if (arg('seed-index') !== undefined) {
  seedIndex = Number(arg('seed-index'));
  const file = process.env.SR_SEEDS || path.join(ROOT, '..', '.sr-seeds', 'seeds.json');
  if (!fs.existsSync(file)) { console.error(`找不到种子明文：${file}（由评测环境放置，或用环境变量 SR_SEEDS 指定）`); process.exit(1); }
  const hit = readJson(file).seeds.find(s => s.index === seedIndex);
  if (!hit) { console.error(`种子表里没有序号 ${seedIndex}`); process.exit(1); }
  SEED = Number(hit.seed) >>> 0;
} else {
  SEED = Number(arg('seed', '67890')) >>> 0;
}
const protoPath = arg('protocol');
const SPEED = Number(arg('speed', (protoPath ? readJson(protoPath).movement?.speed_multiplier : CFG.movement?.speed_multiplier) ?? 1));
const MPK = 2 / SPEED;     // 分钟/km：基准 30 km/h = 2 分钟/km，乘速度倍率后相应缩短（见 src/client/movement_tuning.mjs）
const DIST_CFG = protoPath ? (readJson(protoPath).distribution || {}) : (CFG.distribution || {});
const INTERVAL = Number(arg('interval', AR.interval_min ?? 5));
const DURATION = SC.duration_min ?? 480;
const BATCHES = Number(arg('batches', Math.floor(DURATION / INTERVAL)));
const BUDGET = Number(arg('budget', DURATION));

// 引擎每批都会 console.log 过期清理，会污染 --json 的单行输出；生成供给期间静音，结束后恢复。
const realLog = console.log;
console.log = () => {};
const sim = new Simulator({ seed: SEED, duration: DURATION, mapSize: SC.map_size ?? 'large', baseOrderFrequency: 5 });
sim.setStatus('running');
const DIST = createDistribution({ nodes: sim.getNodes(), seed: SEED, config: DIST_CFG });
DIST.applyToExisting(sim);

const all = new Map();
const grab = () => {
  for (const o of sim.getAvailableOrders()) {
    if (!all.has(o.id)) {
      all.set(o.id, { ...o, deliveryFee: +(o.deliveryFee + calculateTimeSlotFee(o.createdAt)).toFixed(2) });
    }
  }
};
grab();
const clock = sim.getGameClock();
const t0 = sim.getCurrentTime();
for (let i = 1; i <= BATCHES; i++) {
  clock.currentTime = t0 + i * INTERVAL;      // 与 rider_client 一致：出生时刻 = 批次边界
  DIST.spawnBatch(sim, t0 + i * INTERVAL);
  grab();
}
console.log = realLog;
const rows = [...all.values()];

function knapsack(costFn, budget, step = 0.05) {
  const cap = Math.round(budget / step);
  const dp = new Float64Array(cap + 1);
  const cnt = new Int32Array(cap + 1);      // 与 dp 同步记录“最优解里有几单”
  for (const o of rows) {
    const t = Math.round(costFn(o) / step);
    if (t <= 0 || t > cap) continue;
    for (let c = cap; c >= t; c--) if (dp[c - t] + o.deliveryFee > dp[c]) { dp[c] = dp[c - t] + o.deliveryFee; cnt[c] = cnt[c - t] + 1; }
  }
  let best = 0, n = 0;
  for (let c = 0; c <= cap; c++) if (dp[c] > best) { best = dp[c]; n = cnt[c]; }
  return { best, n };
}

const kA = knapsack(o => 0.5 * MPK * o.distance + 3, BUDGET);
const kB = knapsack(o => MPK * o.distance + 3, BUDGET);
const kC = knapsack(o => MPK * (o.distance + 1.5) + 3, BUDGET);
const out = {
  ...(seedIndex === null ? { seed: SEED } : { seed_index: seedIndex }),
  distribution_enabled: !!DIST.config.enabled,
  speed_multiplier: SPEED,
  supply: { batches: BATCHES, orders: rows.length, fee_sum: +rows.reduce((s, o) => s + o.deliveryFee, 0).toFixed(2) },
  bound: {
    A_hard: +kA.best.toFixed(1),
    B_roundtrip: +kB.best.toFixed(1),
    C_realistic: +kC.best.toFixed(1),
  },
  orders_in_bound: { A_hard: kA.n, B_roundtrip: kB.n, C_realistic: kC.n },
};
out.suggested_anchor = {
  at_71pct_of_C: Math.round(out.bound.C_realistic * 0.71),
  at_62pct_of_B: Math.round(out.bound.B_roundtrip * 0.62),
};
if (flag('json')) {
  console.log(JSON.stringify(out));
} else {
  console.log(JSON.stringify(out, null, 1));
  console.log('\n提示：A 默认用“净利 / 该种子的 C 界 × 系数”归一（见 docs/scoring.md）；换版本要重标系数。');
}

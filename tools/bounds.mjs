// 物理界与锚值标定：给定种子，算出该场景“理论上限”的三种口径。
// 用法：node tools/bounds.mjs [--seed 12345] [--batches 96] [--budget 480]
// 口径：
//   A 数学硬界    每单只承认 载货段 d + 取送 3 分钟（空驶/容量/时限/电量全放开）
//   B 往返口径    每单 2d + 3（每单都要跑一趟往返）
//   C 现实路由界  每单 2d + 3 + 1.5km 接驾（送完还得骑到下一家店）
// 供给按全场 480 分钟 / 5 分钟一批生成，与 simulator 同参数（seed / large / 480）。
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));          // tools
const ROOT = path.resolve(HERE, '..');
register(pathToFileURL(path.join(ROOT, 'src', 'engine', 'loader.mjs')).href);
const { Simulator } = await import(pathToFileURL(path.join(ROOT, 'src', 'engine', 'core', 'simulator.js')).href);

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SEED = Number(arg('seed', '67890')) >>> 0;
const BATCHES = Number(arg('batches', '96'));     // 480 / 5
const BUDGET = Number(arg('budget', '480'));

const sim = new Simulator({ seed: SEED, duration: 480, mapSize: 'large', baseOrderFrequency: 5 });
const all = new Map();
const grab = () => { for (const o of sim.getAvailableOrders()) if (!all.has(o.id)) all.set(o.id, { ...o }); };
grab();
for (let i = 0; i < BATCHES; i++) { sim.advanceSimulation(); grab(); }
const rows = [...all.values()];

function knapsack(costFn, budget, step = 0.05) {
  const cap = Math.round(budget / step);
  const dp = new Float64Array(cap + 1);
  for (const o of rows) {
    const t = Math.round(costFn(o) / step);
    if (t <= 0 || t > cap) continue;
    for (let c = cap; c >= t; c--) if (dp[c - t] + o.deliveryFee > dp[c]) dp[c] = dp[c - t] + o.deliveryFee;
  }
  let best = 0;
  for (let c = 0; c <= cap; c++) if (dp[c] > best) best = dp[c];
  return best;
}

const out = {
  seed: SEED,
  supply: { batches: BATCHES, orders: rows.length, fee_sum: +rows.reduce((s, o) => s + o.deliveryFee, 0).toFixed(2) },
  bound: {
    A_hard: +knapsack(o => o.distance + 3, BUDGET).toFixed(1),
    B_roundtrip: +knapsack(o => 2 * o.distance + 3, BUDGET).toFixed(1),
    C_realistic: +knapsack(o => 2 * o.distance + 3 + 3, BUDGET).toFixed(1),
  },
};
out.suggested_anchor = {
  at_71pct_of_C: Math.round(out.bound.C_realistic * 0.71),
  at_62pct_of_B: Math.round(out.bound.B_roundtrip * 0.62),
};
console.log(JSON.stringify(out, null, 1));
console.log('\n提示：换种子要重标锚值（写进 configs/benchmark.json → scoring.anchor_yuan）；多种子可用“净利 / 该种子 C”归一化后比较。');

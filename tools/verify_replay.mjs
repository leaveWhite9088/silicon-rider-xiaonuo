// 回放核验：把 trace.jsonl 里每一条调用用原引擎重放一遍，与 result.json 逐字段对账。
// 用法：node tools/verify_replay.mjs runs/<名> --seed <种子> [--quiet]
// 退出码：0 = 完全一致；1 = 存在不一致或参数错误。
//
// 注意：本文件的“世界推进”逻辑必须与 src/client/rider_client.mjs 保持一致
//   （按 5 分钟边界生单、每次动作后清理过期单、wait 只推时钟）。
//   一致性由 tests/smoke.ps1 里的回放断言兜底。
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
register(pathToFileURL(path.join(ROOT, 'src', 'engine', 'loader.mjs')).href);
const { Simulator } = await import(pathToFileURL(path.join(ROOT, 'src', 'engine', 'core', 'simulator.js')).href);

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const runDir = path.resolve(arg('run', argv[0] || ''));
const seed = Number(arg('seed', '0')) >>> 0;
const quiet = argv.includes('--quiet');
if (!runDir || !fs.existsSync(path.join(runDir, 'protocol.json'))) {
  console.error('用法：node tools/verify_replay.mjs <运行目录> --seed <种子>');
  process.exit(1);
}
if (!seed) { console.error('必须提供 --seed（回放需要同一种子才能重建地图与订单流）'); process.exit(1); }

const proto = JSON.parse(fs.readFileSync(path.join(runDir, 'protocol.json'), 'utf8'));
const res = JSON.parse(fs.readFileSync(path.join(runDir, 'result.json'), 'utf8'));
const sc = proto.scene || {}, ar = proto.arrival || {};
const ARRIVAL = ar.mode || 'sim_time', INT = ar.interval_min ?? 5, RT = ar.round_tick ?? 5;
const MAXR = proto.max_rounds ?? 400;
const realLog = console.log;
if (quiet) console.log = () => {};

const sim = new Simulator({ seed, duration: sc.duration ?? 480, mapSize: sc.map_size || 'large', baseOrderFrequency: 5 });
sim.setStatus('running');

let nextArrival = sim.getCurrentTime() + INT;
function spawnDue() {
  if (ARRIVAL !== 'sim_time') return;
  const clock = sim.getGameClock();
  const real = clock.getCurrentTime();
  let n = 0;
  while (real >= nextArrival && n < 200) {
    clock.currentTime = nextArrival;      // 出生时间 = 边界时刻
    sim.advanceSimulation();
    nextArrival += INT;
    n++;
  }
  clock.currentTime = real;
}

const rows = fs.readFileSync(path.join(runDir, 'trace.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const calls = rows.filter(r => r.type === 'tool');
let rounds = 0;
for (const rec of calls) {
  if (rounds >= MAXR) break;
  if (sim.shouldTerminate()) break;
  const name = rec.call?.name;
  const parameters = rec.call?.arguments || {};
  const disabled = ((rec.response || {}).error || {}).code === 'TOOL_DISABLED';
  if (disabled) { rounds++; continue; }                 // 被禁工具只计轮数，不执行
  let resp;
  if (name === 'wait') {
    const clock = sim.getGameClock(), adv = clock.advance; let once = false;
    clock.advance = function (m) { if (once) return this.getCurrentTime(); once = true; return adv.call(this, m); };
    const origSpawn = sim.advanceSimulation;
    sim.advanceSimulation = () => { };
    try { resp = await sim.executeToolCall({ toolName: name, parameters }); }
    finally { clock.advance = adv; sim.advanceSimulation = origSpawn; }
  } else {
    resp = await sim.executeToolCall({ toolName: name, parameters });
  }
  rounds++;
  if (ARRIVAL === 'sim_time') {
    try { sim.orderGenerator.removeExpiredOrders(sim.getCurrentTime()); } catch { }
    spawnDue();
  } else if (rounds % RT === 0 && !sim.shouldTerminate()) {
    sim.advanceSimulation();
  }
  if (sim.shouldTerminate()) break;
}
console.log = realLog;

const a = sim.getAgentState(), s = sim.getScoreCalculator().calculateMetrics();
const mine = {
  rounds,
  profit: +a.getProfit().toFixed(6),
  endMinute: +sim.getCurrentTime().toFixed(6),
  completed: s.completedOrders,
  onTime: s.onTimeOrders,
  km: +s.totalDistance.toFixed(6),
  swaps: s.batterySwaps,
  penalty: +s.totalPenalty.toFixed(6),
  carried: a.getCarriedOrders().length,
};
const file = {
  rounds: res.rounds,
  profit: +(res.snapshot?.profit ?? 0).toFixed(6),
  endMinute: +(res.snapshot?.minute ?? 0).toFixed(6),
  completed: res.score?.completedOrders ?? 0,
  onTime: res.score?.onTimeOrders ?? 0,
  km: +(res.score?.totalDistance ?? 0).toFixed(6),
  swaps: res.score?.batterySwaps ?? 0,
  penalty: +(res.score?.totalPenalty ?? 0).toFixed(6),
  carried: (res.snapshot?.orders || []).length,
};

const keys = Object.keys(mine);
const bad = keys.filter(k => Math.abs(Number(mine[k]) - Number(file[k])) > 1e-6);
const label = { rounds: '轮数', profit: '净利', endMinute: '结束时刻', completed: '完成单', onTime: '准时单', km: '里程', swaps: '换电', penalty: '罚款', carried: '在途' };
console.log(`回放核验：${path.basename(runDir)}（种子已核对 ${proto.scene?.seed_commit?.slice(0, 12)}…）`);
for (const k of keys) {
  const ok = !bad.includes(k);
  console.log(`  ${ok ? '✓' : '✗'} ${label[k] || k}: 回放 ${mine[k]} / 记录 ${file[k]}`);
}
if (bad.length) {
  console.error(`\n不一致：${bad.join(', ')}　→ 该次成绩无效`);
  process.exit(1);
}
console.log('\n完全一致：结算可信。');

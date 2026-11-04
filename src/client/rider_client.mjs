// 外卖骑手会话驱动 v1 · xiaonuo 版
// 职责：起一局 480 分钟班次，把每轮观察打印成一行 JSON，接收一行工具调用并推进引擎。
// 口径要点：
//   ① 新单按“模拟时间”生成（每 arrival.interval_min 分钟一批）；查询不推进时间 → 不能刷单
//   ② 种子不落盘，只写 sha256 承诺；跑完由评分方用 --seed 验证
//   ③ 计时分两套：driver_wall 与 end_to_end（默认 B2 口径），并记录 t0 来源（命令传入/进程自动）
//   ④ 840 越线可硬拒（--clock-cap reject），默认 ignore
// 用法：
//   node src/client/rider_client.mjs --model 名称 [--seed 12345 | --seed-file 路径] [--t0 ISO8601]
//        [--arrival sim_time|rounds] [--arrival-interval 5] [--round-tick 5]
//        [--clock-cap ignore|reject] [--max-rounds 400] [--out 目录] [--config 配置]
// 每轮输入一行 JSON：{"toolName":"move_to","parameters":{"targetLocationId":"node_22"}}
// 特殊命令：status=打印完整状态（不计轮数）  quit=提前收工结算
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));          // src/client
const ROOT = path.resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const loadJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const CFG = loadJson(path.resolve(arg('config', path.join(ROOT, 'configs', 'benchmark.json')))) || {};
const SC = CFG.scene || {}, AR = CFG.arrival || {}, CK = CFG.clock || {}, RD = CFG.rounds || {};

register('../engine/loader.mjs', import.meta.url);

const MODEL = arg('model', 'unknown-model');
let seedRaw = arg('seed', null);
const SEED_FILE = arg('seed-file', null);
if (!seedRaw && SEED_FILE) seedRaw = fs.readFileSync(SEED_FILE, 'utf8').trim().split(/\s+/)[0];
const SEED = Number(seedRaw ?? 67890) >>> 0;
const ARRIVAL = arg('arrival', AR.mode ?? 'sim_time');              // sim_time | rounds
const ARRIVAL_MIN = Number(arg('arrival-interval', AR.interval_min ?? 5));
const ROUND_TICK = Number(arg('round-tick', 5));
const CLOCK_CAP = arg('clock-cap', CK.cap ?? 'ignore');             // ignore | reject
const MAXR = Number(arg('max-rounds', RD.max ?? 400));
const T0_ARG = arg('t0', process.env.SR_T0 || '');
const T0_PARSED = Date.parse(T0_ARG);
const T0 = Number.isFinite(T0_PARSED) ? T0_PARSED : Date.now();
const T0_SOURCE = Number.isFinite(T0_PARSED) ? 'external' : 'process';   // external=命令传入；process=进程自动记录；两者都可作为 B2 起点
const OUT = path.resolve(arg('out', path.join(ROOT, 'runs', MODEL)));
const COMMIT = crypto.createHash('sha256').update('sr:' + SEED).digest('hex');

// 本赛制暴露给模型的工具（13 个）：观察里已经给了全部在库单，所以不再提供 search_nearby_orders
const ALLOWED_TOOLS = new Set([
  'get_my_status', 'search_nearby_battery_stations', 'get_location_info', 'calculate_distance',
  'estimate_time', 'help', 'get_map',
  'accept_order', 'move_to', 'pickup_food', 'deliver_food', 'swap_battery', 'wait',
]);

const { Simulator } = await import(pathToFileURL(path.join(HERE, '..', 'engine', 'core', 'simulator.js')).href);
const { MovementCalculator } = await import(pathToFileURL(path.join(HERE, '..', 'engine', 'core', 'movement-calculator.js')).href);

const sim = new Simulator({ seed: SEED, duration: SC.duration_min ?? 480, mapSize: SC.map_size ?? 'large', baseOrderFrequency: 5 });
sim.setStatus('running');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'trace.jsonl'), '');   // 每次运行清空轨迹，避免同一目录重跑时把两次记录追加到一起
const tProcess = Date.now();
const startWall = performance.now();
let rounds = 0, arrivalBatches = 0, rejected = 0;

function snap() {
  const a = sim.getAgentState();
  return { minute: sim.getCurrentTime(), remainingMinutes: sim.getGameClock().getRemainingTime(),
           ended: sim.shouldTerminate(), position: a.getPosition(), battery: a.getBattery(),
           batteryRange: a.getBatteryRange(), orders: a.getCarriedOrders(), weight: a.getTotalWeight(),
           remainingCapacity: a.getRemainingCapacity(), profit: a.getProfit(), distance: a.getTotalDistance(),
           availableOrders: sim.getAvailableOrders(),
           score: sim.getScoreCalculator().calculateMetrics() };
}
function printObs(s) {
  // 已接单的 deadline 用引擎真实值（= 接单时刻 + 时限）
  // 取送点同时给 `pickup/delivery`（推荐，与在库单一致）和 `pickupLocation/deliveryLocation`（兼容旧字段）
  const carried = (s.orders || []).map(o => ({ id: o.id, pickedUp: o.pickedUp,
    pickup: o.pickupLocation, delivery: o.deliveryLocation,
    pickupLocation: o.pickupLocation, deliveryLocation: o.deliveryLocation,
    deadline: o.deadline ?? (o.createdAt + o.timeLimit), timeLimit: o.timeLimit }));
  const open = (s.availableOrders || []).map(o => ({ id: o.id, fee: +o.deliveryFee.toFixed(2), dist: +o.distance.toFixed(1),
    pickup: o.pickupLocation, delivery: o.deliveryLocation, timeLimit: +o.timeLimit.toFixed(1),
    createdAt: +o.createdAt.toFixed(1), weight: +o.weight.toFixed(2),
    expiresIn: +Math.max(0, o.createdAt + o.timeLimit - s.minute).toFixed(1) }));   // 还能在库里待几分钟
  console.log(JSON.stringify({ minute: +s.minute.toFixed(1), remainingMinutes: +s.remainingMinutes.toFixed(1),
    position: s.position, battery: +s.battery.toFixed(1), batteryRange: +s.batteryRange.toFixed(1),
    weight: +s.weight.toFixed(2), remainingCapacity: s.remainingCapacity, profit: +s.profit.toFixed(2),
    carried, openOrders: open }));
}
const wfile = obj => fs.appendFileSync(path.join(OUT, 'trace.jsonl'), JSON.stringify(obj) + '\n');

// ---- 新单到达：按模拟时间 ----
let nextArrival = sim.getCurrentTime() + ARRIVAL_MIN;
function spawnDue() {
  if (ARRIVAL !== 'sim_time') return;
  const beforeIds = new Set(sim.getAvailableOrders().map(o => o.id));
  let n = 0;
  const clock = sim.getGameClock();
  const real = clock.getCurrentTime();
  while (real >= nextArrival && n < 200) {
    clock.currentTime = nextArrival;   // 到点就生成：出生时间 = 边界时刻（不是动作结束时刻）
    sim.advanceSimulation();
    nextArrival += ARRIVAL_MIN;
    n++;
  }
  clock.currentTime = real;
  if (!n) return;
  arrivalBatches += n;
  const fresh = sim.getAvailableOrders().filter(o => !beforeIds.has(o.id)).map(o => o.id);
  wfile({ type: 'tick', round: rounds, batches: n, minute: +real.toFixed(2), newOrders: fresh });
  console.log(`— 新单到达：+${n} 批 / +${fresh.length} 单（${fresh.join(',')}）—`);
}

// ---- 840 越线预估（仅用于 --clock-cap reject）----
function estMinutes(call) {
  const a = sim.getAgentState(), pf = sim.getPathfinder(), cm = sim.getCongestionManager(), now = sim.getCurrentTime();
  const t = call.toolName;
  if (t === 'move_to') {
    const pr = pf.calculateDistance(a.getPosition(), call.parameters.targetLocationId);
    if (!pr) return 0;
    let sum = 0, k = 0;
    for (let i = 0; i < pr.path.length - 1; i++) { const e = pf.getEdge(pr.path[i], pr.path[i + 1]); if (e) { sum += cm.getCongestion(e, now); k++; } }
    return MovementCalculator.calculateMovement(pr.distance, k ? sum / k : 0, a.getBattery()).time;
  }
  if (t === 'wait') return Number(call.parameters.minutes) || 0;
  if (t === 'pickup_food') return 2;
  if (t === 'deliver_food') return 1;
  if (t === 'swap_battery') return 1;
  return 0;
}

const s0 = snap();
wfile({ type: 'initial', snapshot: s0 });
console.log(`会话开始：模型=${MODEL} 起点=06:00 班次=${SC.duration_min ?? 480} 分钟 供给口径=${ARRIVAL === 'sim_time' ? `每 ${ARRIVAL_MIN} 模拟分钟一批` : `每 ${ROUND_TICK} 个模型轮次一批（rounds 兼容模式）`} 时钟上限=${SC.end_minute ?? 840}(${CLOCK_CAP})`);
console.log(`种子承诺=${COMMIT.slice(0, 16)}…（明文不入盘；跑完由评分方用 --seed 验证）`);
printObs(s0);

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let termination = null;
for await (const line of rl) {
  const raw = line.trim();
  if (!raw) continue;
  if (raw === 'quit' || raw === 'exit') { termination = 'model_stopped_early'; break; }
  if (raw === 'status') { printObs(snap()); continue; }
  let call;
  try { call = JSON.parse(raw); } catch { console.log('输入必须是 JSON：{"toolName":...,"parameters":{...}}'); continue; }
  const name = call.toolName || call.name;
  const parameters = call.parameters ?? call.arguments ?? {};
  if (!name) { console.log('缺少 toolName'); continue; }
  if (!ALLOWED_TOOLS.has(name)) {
    rounds++;
    const resp = { success: false, error: { code: 'TOOL_DISABLED', message: `工具不可用：${name}（本赛制共 ${ALLOWED_TOOLS.size} 个工具，见 help）` } };
    wfile({ type: 'tool', round: rounds, t: Date.now(), call: { name, arguments: parameters }, response: resp, before: snap(), after: snap() });
    console.log(`[${name}] success=false error=TOOL_DISABLED（本赛制无此工具）`);
    continue;
  }
  if (rounds >= MAXR) { termination = 'round_limit'; break; }
  if (sim.shouldTerminate()) { termination = 'scene_completed'; break; }
  if (CLOCK_CAP === 'reject') {
    const est = estMinutes({ toolName: name, parameters });
    if (sim.getCurrentTime() + est > (SC.end_minute ?? 840) + 1e-9) {
      rejected++;
      wfile({ type: 'rejected', atMinute: +sim.getCurrentTime().toFixed(2), call: { name, arguments: parameters }, estMinutes: +est.toFixed(2), reason: 'clock_cap' });
      console.log(`[${name}] 拒绝：将越过 ${(SC.end_minute ?? 840)} 分钟线（+${est.toFixed(1)} 分）`);
      continue;
    }
  }
  const before = snap();
  let response;
  if (name === 'wait') {
    const clock = sim.getGameClock(); const advance = clock.advance; let adv = false;
    clock.advance = function (m) { if (adv) return this.getCurrentTime(); adv = true; return advance.call(this, m); };
    const origSpawn = sim.advanceSimulation;
    sim.advanceSimulation = () => { };                 // 让 wait 只推时钟；生单统一交给 spawnDue 按边界补发
    try { response = await sim.executeToolCall({ toolName: name, parameters }); }
    finally { clock.advance = advance; sim.advanceSimulation = origSpawn; }
  } else {
    response = await sim.executeToolCall({ toolName: name, parameters });
  }
  rounds++;
  if (ARRIVAL === 'sim_time') {
    // ① 立即清理过期单：保证观察里出现的单一定还没过期
    try { sim.orderGenerator.removeExpiredOrders(sim.getCurrentTime()); } catch { }
    // ② 按 5 分钟边界补发生单（每批的 createdAt = 边界时刻）
    spawnDue();
  }
  const after = snap();
  wfile({ type: 'tool', round: rounds, t: Date.now(), call: { name, arguments: parameters }, response, before, after });
  console.log(`[${name}] success=${response.success}` + (response.success ? '' : ` error=${JSON.stringify(response.error || {}).slice(0, 120)}`));
  // 工具返回的数据必须让模型看到（查询结果 / 移动耗时 / 结算金额），单列一行便于解析
  if (response.success && response.data) console.log(`[result] ${JSON.stringify(response.data)}`);
  printObs(after);
  if (ARRIVAL === 'rounds' && rounds % ROUND_TICK === 0 && !after.ended) {
    const bIds = new Set(sim.getAvailableOrders().map(o => o.id));
    sim.advanceSimulation();
    const fresh = sim.getAvailableOrders().filter(o => !bIds.has(o.id)).map(o => o.id);
    arrivalBatches++;
    wfile({ type: 'tick', round: rounds, batches: 1, minute: +sim.getCurrentTime().toFixed(2), newOrders: fresh });
    console.log(`— tick：新订单可能已生成（+${fresh.length} 单）—`);
  }
  if (sim.shouldTerminate()) { termination = 'scene_completed'; break; }
}

const tEnd = Date.now();
const wallSeconds = (performance.now() - startWall) / 1000;
const endToEnd = (tEnd - T0) / 1000;
const fin = snap();
termination = termination || (fin.ended ? 'scene_completed' : 'model_stopped_early');
wfile({ type: 'result', snapshot: fin, score: fin.score });
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({
  status: 'completed', termination, resumable: false, participant: { id: MODEL, model: MODEL },
  rounds, wallSeconds: +wallSeconds.toFixed(3), endToEndSeconds: +endToEnd.toFixed(3),
  arrivalBatches, rejected, overrun: fin.minute > (SC.end_minute ?? 840) + 1e-9, t0Source: T0_SOURCE,
  seedCommit: COMMIT, snapshot: fin, score: fin.score,
}, null, 1));
fs.writeFileSync(path.join(OUT, 'protocol.json'), JSON.stringify({
  version: CFG.version || 'xiaonuo-v1',
  scene: { level: '1', duration: SC.duration_min ?? 480, map_size: SC.map_size ?? 'large',
           seed_commit: COMMIT, seed_revealed: false },
  arrival: { mode: ARRIVAL, interval_min: ARRIVAL_MIN, round_tick: ROUND_TICK, batches: arrivalBatches },
  clock: { end_minute: SC.end_minute ?? 840, cap: CLOCK_CAP, overrun: fin.minute > (SC.end_minute ?? 840) + 1e-9, rejected },
  timing: {
    t0_iso: new Date(T0).toISOString(), process_iso: new Date(tProcess).toISOString(), end_iso: new Date(tEnd).toISOString(),
    driver_wall_seconds: +wallSeconds.toFixed(3), end_to_end_seconds: +endToEnd.toFixed(3), b2_basis: 'end_to_end',
    t0_source: T0_SOURCE,
  },
  agent: { scripting: 'allowed' },
  model: MODEL, rounds, max_rounds: MAXR,
}, null, 1));
const mins = endToEnd / 60;
console.log(`\n==== 结算 ====\n终止: ${termination}  轮数: ${rounds}  驱动墙钟: ${wallSeconds.toFixed(0)}s  端到端: ${mins.toFixed(1)} 分钟`);
console.log(`净利润: ${fin.profit.toFixed(2)}  完成单: ${fin.score.completedOrders}  准时率: ${fin.score.onTimeRate?.toFixed(3)}  换电: ${fin.score.batterySwaps}`);
console.log(`结算明细: ${JSON.stringify(fin.score).slice(0, 400)}`);
console.log(`\n下一步：python src/scoring/score_run.py "${OUT}" "${MODEL}" [--seed <种子>]`);
process.exit(0);

// 一键开跑：起一局、喂观察、收动作、落盘。执行者只需要"写一个 policy 文件 + 跑一条命令"。
//
// 用法：
//   node tools/harness.mjs --model Demo-s1 --seed-index 1 --policy ./my-policy.mjs [--t0 ISO]
//                         [--out runs/Demo-s1] [--max-rounds 400] [--quiet]
//
// policy 文件格式（默认导出 next 函数）：
//   export function next(obs, st) {
//     // obs = 一行观察对象；st = { round, last, log }
//     // 返回 { toolName, parameters } 表示执行；返回 null 表示收工（等价于 quit）
//     return { toolName: 'move_to', parameters: { targetLocationId: 'node_22' } };
//   }
//
// 为什么要有它：官方 client 是"一行进、一行出"的交互进程，模型逐轮玩时很难在 shell 里维持；
// 这个 harness 把"读观察 → 调 policy → 写一行"的循环包起来，于是"跑一局"就是一条命令。
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const quiet = process.argv.includes('--quiet');

const MODEL = arg('model', null);
const POLICY = arg('policy', null);
const T0 = arg('t0', new Date().toISOString());
const MAXR = Number(arg('max-rounds', '400'));
if (!MODEL) { console.error('缺少 --model'); process.exit(1); }
if (!POLICY) { console.error('缺少 --policy（写一个 next(obs, st) 的模块）'); process.exit(1); }

// ---- 种子：按序号取，明文在仓库外 ----
// 明文路径：$SR_SEEDS 或 <仓库>/../.sr-seeds/seeds.json（由主控保管；执行者只给序号）
const SEEDS_PATH = process.env.SR_SEEDS || path.join(ROOT, '..', '.sr-seeds', 'seeds.json');
const seedIndex = Number(arg('seed-index', '0'));
let seed = Number(arg('seed', '0')) >>> 0;
if (!seed && seedIndex) {
  if (!fs.existsSync(SEEDS_PATH)) {
    console.error(`找不到种子明文：${SEEDS_PATH}`);
    console.error('由主控把 seeds.json 放到该路径（或用环境变量 SR_SEEDS 指定）；执行者不应自己生成种子。');
    process.exit(1);
  }
  const secret = JSON.parse(fs.readFileSync(SEEDS_PATH, 'utf8'));
  const entry = secret.seeds.find(s => s.index === seedIndex);
  if (!entry) { console.error(`种子表里没有第 ${seedIndex} 个种子`); process.exit(1); }
  seed = entry.seed;
  const commitFile = path.join(ROOT, 'configs', 'seeds.commit.json');
  if (fs.existsSync(commitFile)) {
    const c = JSON.parse(fs.readFileSync(commitFile, 'utf8')).commits.find(x => x.index === seedIndex);
    const calc = crypto.createHash('sha256').update('sr:' + seed).digest('hex');
    if (!c || c.commit !== calc) { console.error(`第 ${seedIndex} 个种子与公开承诺不一致`); process.exit(1); }
  }
}
if (!seed) { console.error('必须给 --seed-index（推荐）或 --seed'); process.exit(1); }

const OUT = path.resolve(arg('out', path.join(ROOT, 'runs', MODEL)));
const client = path.join(ROOT, 'src', 'client', 'rider_client.mjs');
const child = spawn(process.execPath, [client, '--model', MODEL, '--seed', String(seed), '--t0', T0,
  '--out', OUT, '--max-rounds', String(MAXR)], { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'] });

const mod = await import(pathToFileURL(path.resolve(POLICY)).href);
const next = mod.next || mod.default;
if (typeof next !== 'function') { console.error('policy 必须导出 next(obs, st) 或默认导出函数'); process.exit(1); }

let round = 0, done = false;
const st = { round: 0, last: null, lastResult: null, log: [] };
const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

rl.on('line', async line => {
  if (!quiet) console.log(line);
  if (line.startsWith('[result] ')) {
    try { st.lastResult = JSON.parse(line.slice(9)); } catch { }
    return;
  }
  if (!line.startsWith('{"minute":')) return;
  let obs;
  try { obs = JSON.parse(line); } catch { return; }
  if (done) return;
  obs.result = st.lastResult;          // 上一条工具调用的返回数据（查询结果 / 移动耗时 / 结算金额）
  round++; st.round = round; st.last = obs;
  let call = null;
  try { call = await next(obs, st); } catch (e) { console.error('policy 抛错：' + e.message); call = null; }
  if (!call) { child.stdin.write('quit\n'); done = true; return; }
  child.stdin.write(JSON.stringify(call) + '\n');
});

child.on('exit', code => {
  if (!quiet) console.log(`\n[harness] 会话结束 code=${code} 轮数=${round}；产物：${OUT}`);
  process.exit(code ?? 0);
});

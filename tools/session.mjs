// 游戏会话桥：让 LLM 用**普通的 shell 调用**逐轮玩（不需要写 policy）。
//
// 为什么需要它：本环境的 agent 运行时（DSH 等）工具集是固定的，加不进"接单/移动"这些游戏工具。
// 这个桥把一局游戏跑在后台（守护进程），再把每个动作暴露成一条 CLI 命令：
//
//   node tools/session.mjs start --model me-s1 --seed-index 1     # 起局，返回第一条观察
//   node tools/session.mjs act --session me-s1 '{"toolName":"move_to","parameters":{"targetLocationId":"node_22"}}'
//   node tools/session.mjs state --session me-s1                   # 看当前观察
//   node tools/session.mjs stop --session me-s1                    # 收工（等价 quit）
//
// 每次 act 就是一次真实工具调用：引擎执行、推进时间、刷新订单，返回新的观察。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SESS_DIR = path.join(ROOT, '.sessions');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const cmd = process.argv[2];
const SEEDS_PATH = process.env.SR_SEEDS || path.join(ROOT, '..', '.sr-seeds', 'seeds.json');

function readSeed(index) {
  if (!fs.existsSync(SEEDS_PATH)) {
    console.error(`找不到种子明文：${SEEDS_PATH}（由评测环境放置，或用环境变量 SR_SEEDS 指定）`);
    process.exit(1);
  }
  const t = JSON.parse(fs.readFileSync(SEEDS_PATH, 'utf8')).seeds.find(s => s.index === Number(index));
  if (!t) { console.error(`种子表里没有第 ${index} 个`); process.exit(1); }
  const cf = path.join(ROOT, 'configs', 'seeds.commit.json');
  if (fs.existsSync(cf)) {
    const c = JSON.parse(fs.readFileSync(cf, 'utf8')).commits.find(x => x.index === Number(index));
    if (!c || c.commit !== crypto.createHash('sha256').update('sr:' + t.seed).digest('hex')) {
      console.error(`第 ${index} 个种子与公开承诺不一致`); process.exit(1);
    }
  }
  return t.seed;
}
const json = (res, obj, code = 200) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
const sessionFile = name => path.join(SESS_DIR, `${name}.json`);

// ───────────────────────── 守护进程 ─────────────────────────
if (cmd === '__serve') {
  const model = arg('model'), seedIndex = arg('seed-index'), out = arg('out'), port = Number(arg('port'));
  fs.mkdirSync(SESS_DIR, { recursive: true });
  const logPath = path.join(SESS_DIR, `${model}.log`);
  const log = s => fs.appendFileSync(logPath, s + '\n');
  const seed = readSeed(seedIndex);
  const client = path.join(ROOT, 'src', 'client', 'rider_client.mjs');
  const child = spawn(process.execPath, [client, '--model', model, '--seed', String(seed), '--out', out,
    '--t0', new Date().toISOString()], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.on('data', d => log('[stderr] ' + d));

  let lastObs = null, lastResult = null, pending = null, ended = false, buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', d => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (line.startsWith('[result] ')) { try { lastResult = JSON.parse(line.slice(9)); } catch { } }
      else if (line.startsWith('{"minute":')) {
        try { lastObs = JSON.parse(line); } catch { }
        if (pending) { pending(lastObs); pending = null; }
      } else if (line.includes('==== 结算 ====') || line.startsWith('终止:')) { ended = true; }
    }
  });
  child.on('exit', () => { ended = true; if (pending) { pending(lastObs); pending = null; } });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/state') return json(res, { observed: lastObs, result: lastResult, ended });
    if (url.pathname === '/act') {
      const body = await readBody(req);
      if (!body || !body.toolName) return json(res, { error: '缺少 toolName' }, 400);
      if (ended) return json(res, { ended: true, observed: lastObs, result: lastResult });
      const before = lastObs;
      const got = await new Promise(resolve => {
        pending = resolve;
        child.stdin.write(JSON.stringify({ toolName: body.toolName, parameters: body.parameters || {} }) + '\n');
        setTimeout(() => { if (pending === resolve) { pending = null; resolve(null); } }, 180000);
      });
      return json(res, { ok: !!got, observed: got || lastObs, result: lastResult, ended,
        advanced: before && got ? +(got.minute - before.minute).toFixed(2) : 0 });
    }
    if (url.pathname === '/stop') {
      try { child.stdin.write('quit\n'); } catch { }
      json(res, { ok: true });
      setTimeout(() => process.exit(0), 400);
      return;
    }
    json(res, { error: 'unknown' }, 404);
  });
  server.listen(port, '127.0.0.1', () => log(`listening :${port} model=${model}`));
  process.on('SIGTERM', () => process.exit(0));
  await new Promise(() => { });        // 守护进程常驻，直到 /stop
}

// ───────────────────────── 客户端命令 ─────────────────────────
async function call(name, port, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: name, method: body ? 'POST' : 'GET' }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error(d)); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

if (cmd === 'start') {
  const model = arg('model', null), seedIndex = arg('seed-index', null);
  if (!model || !seedIndex) { console.error('用法: node tools/session.mjs start --model <名> --seed-index <1|2|3>'); process.exit(1); }
  fs.mkdirSync(SESS_DIR, { recursive: true });
  const out = path.resolve(arg('out', path.join(ROOT, 'runs', model)));
  const port = Number(arg('port', String(7800 + Math.floor(Math.random() * 200))));
  const p = spawn(process.execPath, [fileURLToPath(import.meta.url), '__serve', '--model', model,
    '--seed-index', String(seedIndex), '--out', out, '--port', String(port)],
    { cwd: ROOT, detached: true, stdio: 'ignore' });
  p.unref();
  fs.writeFileSync(sessionFile(model), JSON.stringify({ model, port, pid: p.pid, out, seedIndex: Number(seedIndex) }, null, 1));
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 100));
    try {
      const s = await call('/state', port);
      if (s.observed) {
        console.log(JSON.stringify({ session: model, port, out, observed: s.observed, result: s.result ?? null }, null, 1));
        process.exit(0);
      }
    } catch { }
  }
  console.error('启动超时，看 .sessions/' + model + '.log');
  process.exit(1);
}

const SESSION = arg('session', null);
if (!SESSION) { console.error('缺少 --session'); process.exit(1); }
const info = JSON.parse(fs.readFileSync(sessionFile(SESSION), 'utf8'));

if (cmd === 'act') {
  const raw = process.argv[process.argv.length - 1];
  let body;
  try { body = JSON.parse(raw); } catch { console.error('最后一个参数必须是工具调用 JSON'); process.exit(1); }
  if (!body.toolName && body.name) { body.toolName = body.name; body.parameters = body.arguments || body.parameters; }
  const r = await call('/act', info.port, body);
  console.log(JSON.stringify(r, null, 1));
} else if (cmd === 'state') {
  console.log(JSON.stringify(await call('/state', info.port), null, 1));
} else if (cmd === 'stop') {
  console.log(JSON.stringify(await call('/stop', info.port), null, 1));
  try { fs.unlinkSync(sessionFile(SESSION)); } catch { }
} else if (cmd === 'list') {
  for (const f of fs.readdirSync(SESS_DIR).filter(f => f.endsWith('.json'))) console.log(fs.readFileSync(path.join(SESS_DIR, f), 'utf8'));
} else {
  console.error('命令：start | act | state | stop | list');
  process.exit(1);
}

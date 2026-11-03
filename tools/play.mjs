// 一次跑多个种子（每个种子一局），默认**并发**。执行者只需要这一条命令。
//
// 用法：
//   node tools/play.mjs --model Demo --policy examples/policy-greedy.mjs --seeds 1,2,3 [--score] [--serial]
//
//   --seeds   逗号分隔的**预注册序号**（不是明文种子）
//   --score   跑完顺手评分（A/B/C），不写排行榜
//   --serial  串行跑（默认并发；并发时每个种子是独立进程，互不影响）
//
// 产物：runs/<model>-s1、runs/<model>-s2、runs/<model>-s3
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes('--' + k);

const MODEL = arg('model', null);
const POLICY = arg('policy', null);
const SEEDS = String(arg('seeds', '1,2,3')).split(',').map(s => Number(s.trim())).filter(Boolean);
const SERIAL = has('serial');
const SCORE = has('score');
const T0 = arg('t0', null);
if (!MODEL || !POLICY) {
  console.error('用法: node tools/play.mjs --model <名> --policy <policy.mjs> --seeds 1,2,3 [--score] [--serial]');
  process.exit(1);
}

const harness = path.join(ROOT, 'tools', 'harness.mjs');
const scorer = path.join(ROOT, 'src', 'scoring', 'score_run.py');
const runName = idx => `${MODEL}-s${idx}`;
const runDir = idx => path.join(ROOT, 'runs', runName(idx));
const spawnP = (cmd, args) => new Promise(resolve => {
  const p = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', d => out += d);
  p.stderr.on('data', d => out += d);
  p.on('exit', code => resolve({ code, out }));
});

async function runSeed(idx) {
  const args = [harness, '--model', runName(idx), '--seed-index', String(idx), '--policy', POLICY, '--out', runDir(idx), '--quiet'];
  if (T0) args.push('--t0', T0);
  const { code, out } = await spawnP(process.execPath, args);
  let res = null;
  try { res = JSON.parse(fs.readFileSync(path.join(runDir(idx), 'result.json'), 'utf8')); } catch { }
  return { idx, code, res, tail: out.trim().split('\n').slice(-2).join(' | ') };
}

const wall = process.hrtime.bigint();
const per = [];
if (SERIAL) { for (const i of SEEDS) per.push(await runSeed(i)); }
else { per.push(...await Promise.all(SEEDS.map(runSeed))); }
const seconds = Number(process.hrtime.bigint() - wall) / 1e9;

console.log(`\n跑完 ${per.length} 局（${SERIAL ? '串行' : '并发'}，${seconds.toFixed(1)}s）\n`);
console.log('| 种子 | 退出 | 轮数 | 净利 | 单数 | 准时率 | 产物 |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const p of per) {
  const s = p.res?.score || {}, snap = p.res?.snapshot || {};
  console.log(`| ${p.idx} | ${p.code} | ${p.res?.rounds ?? '-'} | ${(snap.profit ?? 0).toFixed(2)} | ${s.completedOrders ?? '-'} `
    + `| ${s.onTimeRate == null ? '-' : Number(s.onTimeRate).toFixed(2)} | ${p.code === 0 ? '✓' : '✗ ' + p.tail} |`);
}

if (SCORE) {
  console.log('\n评分（A/B/C，不写排行榜）：');
  for (const p of per) {
    const r = await spawnP('python', [scorer, runDir(p.idx), runName(p.idx), '--seed-index', String(p.idx), '--no-record']);
    const line = r.out.split('\n').find(l => l.includes('评分完成')) || r.out.trim().split('\n').slice(-1)[0];
    console.log(`  种子 ${p.idx}: ${line}`);
  }
}

console.log(`\n产物目录：runs/${MODEL}-s{${SEEDS.join(',')}}`);
console.log('下一步：');
console.log(`  python src/scoring/judge_pack.py --model ${MODEL} --print      # 打印事实卡、生成待填草稿`);
console.log(`  python src/scoring/finalize.py --model ${MODEL} --runs `
  + SEEDS.map(i => `runs/${runName(i)}`).join(' ')
  + ` --seed-indexes ${SEEDS.join(',')} --d-file leaderboard/verdicts/${MODEL}.draft.json`);

// 种子预注册：生成/固定一组种子。
// 用法：node tools/gen_seeds.mjs --n 3 [--out configs/seeds.json]
//
// 产物：
//   configs/seeds.json         明文（**不进库**，由主控保管并备份）——执行者通过 --seed-index 使用，无需看到明文
//   configs/seeds.commit.json  只含 sha256 承诺（**进库**）——证明这组种子是先定好的、事后没换
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const n = Number(arg('n', '3'));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
// 明文默认放在**仓库外**（<仓库>/../.sr-seeds/seeds.json），只把承诺写进 configs/
const secretPath = path.resolve(arg('out', path.join(ROOT, '..', '.sr-seeds', 'seeds.json')));
const commitPath = path.join(ROOT, 'configs', 'seeds.commit.json');

if (fs.existsSync(secretPath) && !process.argv.includes('--force')) {
  console.error(`已存在 ${secretPath}：种子一经确定就不应更换（更换会导致成绩不可比）。`);
  console.error('确需重建请加 --force（会使既有成绩失效）。');
  process.exit(1);
}

const seeds = [];
for (let i = 0; i < n; i++) {
  const v = crypto.randomInt(1, 2 ** 31 - 1);          // 引擎 RNG 是 32 位（Mulberry32）
  seeds.push({ index: i + 1, seed: v, commit: crypto.createHash('sha256').update('sr:' + v).digest('hex') });
}
fs.writeFileSync(secretPath, JSON.stringify({ created: new Date().toISOString(), seeds }, null, 1));
fs.writeFileSync(commitPath, JSON.stringify({
  created: new Date().toISOString(),
  note: '本组种子一次性确定、此后不更换。明文在 configs/seeds.json（不进库，由主控保管备份）；此处只公开承诺。',
  commits: seeds.map(s => ({ index: s.index, commit: s.commit })),
}, null, 1));

console.log('已写入（保密，勿入库）：' + secretPath);
console.log('已写入（可入库，公开承诺）：' + commitPath);
for (const s of seeds) console.log(`  #${s.index}  sha256=${s.commit}`);
console.log('\n提醒：请把 configs/seeds.json 备份到仓库之外；丢失后无法重跑同一组种子（只能发布新版本并重标基线）。');

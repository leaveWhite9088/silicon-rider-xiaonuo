// 种子预注册：生成 n 个随机 32 位种子 + 各自的 sha256 承诺。
// 用法：node tools/gen_seeds.mjs --n 3 [--out seeds.json]
// 约定：seeds.json 只给裁判/主控保存，不要放进被测模型可达的目录；
//       承诺（commit）可以公开，用来证明“种子是提前定好的、事后没换”。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const n = Number(arg('n', '3'));
const HERE = path.dirname(fileURLToPath(import.meta.url));   // tools
const ROOT = path.resolve(HERE, '..');
const out = path.resolve(arg('out', path.join(ROOT, 'seeds.json')));

const seeds = [];
for (let i = 0; i < n; i++) {
  const v = crypto.randomInt(1, 2 ** 31 - 1);          // 引擎 RNG 是 32 位（Mulberry32）
  seeds.push({ index: i + 1, seed: v, commit: crypto.createHash('sha256').update('sr:' + v).digest('hex') });
}
fs.writeFileSync(out, JSON.stringify({ created: new Date().toISOString(), seeds }, null, 1));
console.log('已写入（保密，勿入库）：' + out);
console.log('可公开的预注册承诺：');
for (const s of seeds) console.log(`  #${s.index}  sha256=${s.commit}`);
console.log('\n注意：引擎 RNG 是 32 位，承诺哈希理论上可被暴力反推；真正的保密只能靠“把引擎/种子放在模型看不到的地方”。');

# runs/

每次运行一个子目录，由 `src/client/rider_client.mjs` 自动创建：

```
runs/<模型名-[种子标签]>/
├── trace.jsonl       完整轨迹（initial / tool / tick / result）
├── result.json       引擎结算 + 计时 + 种子承诺
├── protocol.json     本次运行的口径（供给/时钟/计时/承诺）
├── factcard.md       决策事实卡（D 层唯一输入，评分时生成）
└── 评分.json          A/B/C（评分时生成）
```

约定：

- 目录名建议 `模型名-s1` / `模型名-s2` / `模型名-s3`，一次批量 3 个种子；
- `trace.jsonl` 体积较大（约 1–5 MB/班），已被 `.gitignore` 排除；
- 重放核验：用 `src/engine/` 的原引擎按 `trace.jsonl` 逐条执行，结算必须与 `result.json` 一致。

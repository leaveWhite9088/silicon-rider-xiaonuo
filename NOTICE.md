# NOTICE

## 上游

本项目的模拟引擎（`src/engine/`）来自 **KCORES · Silicon Rider Bench**（MIT 许可）的编译产物。
**本目录未改动引擎逻辑**；唯一例外是补回上游缺失的 `src/engine/client/system-prompt.js`（`help` 工具依赖它，
缺文件会导致 `help` 调用必然失败），该文件为新增、不含逻辑修改。上游仓库与许可声明请以其原始发布为准。

## 本地改动（全部发生在本目录内，未回写上游）

| 路径 | 内容 |
| --- | --- |
| `src/client/rider_client.mjs` | 会话驱动：供给口径（按模拟时间）、端到端计时、种子承诺、时钟上限 |
| `src/scoring/` | A/B/C 指标、决策事实卡、评分入口、多种子汇总 |
| `configs/` `docs/` `tools/` `scripts/` `tests/` | 配置、文档、工具链 |

## 引用

在论文或报告中引用时，请**同时**注明上游 Silicon Rider Bench 与本目录的版本（见 `CHANGELOG.md`）。

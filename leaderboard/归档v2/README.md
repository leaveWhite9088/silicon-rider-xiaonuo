# 归档v2（xiaonuo-v1.4 及更早）

v1.5 开榜前归档的整套榜单产物，**只读留档，不参与 v1.5 出榜**，也不能与 v1.5 成绩混排。

| 路径 | 内容 |
| --- | --- |
| `scores.md` | 归档时的榜单（含大榜与各模型三局明细，v1.4 锚值 500） |
| `verdicts/` | 各模型最终裁决 JSON |
| `blind/` | 当时生成的 12 个匿名盲评包 |
| `blind-maps/` | 盲评私有映射（`case_id -> run`），**不得交给评委** |
| `reviews.jsonl` | 当时的中心评审日志（只追加，不得手改） |

对应的运行数据在 `runs/归档v2/`（v1.4 批次）与 `runs/归档v1/`。

如需重算，指向本目录即可，例如 `finalize.py --review-log leaderboard/归档v2/reviews.jsonl --blind-map ...`；
注意 `leaderboard/finalize.py` 的自动发现只看 `leaderboard/blind-maps/`，不会再读到这里。

归档时 v1.4 → v1.5 的差异见根目录 `CHANGELOG.md` 的 v1.5 一节。

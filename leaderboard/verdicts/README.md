# leaderboard/verdicts/

每个模型的**裁判裁决原始记录**，由 `src/scoring/finalize.py` 写入，一个模型一个文件：

```
leaderboard/verdicts/<模型名>.json
{
  "model": "...",
  "blind_pack_id": "...",
  "finalized_at": "2026-...",
  "runs": [ { run, case_id, seed_commit, seed_verified, replay_ok, profit, completed, endToEndMin, A, B, C, D, total } ],
  "mean":  { profit, A, B, C, D, total },
  "range_half": { ... }        # 极差的一半
}
```

## 盲评包与私有映射

`judge_pack.py` 会生成：

- `leaderboard/blind/<pack_id>/`：交给评委的唯一路径。内含匿名 `case-*.md`、`README.md`、`RUBRIC.md` 和 `verdict.draft.json`；不含模型名、A/B/C、运行目录或种子明文。
- `leaderboard/verdicts/<模型名>.blind-map.json`：`case_id -> runs/<名>` 的私有映射，只给主控和 `finalize.py`，**不能给评委**。

`finalize.py` 用 `--d-file <盲评包>/verdict.draft.json --blind-map leaderboard/verdicts/<模型名>.blind-map.json` 把匿名 D 分映射回运行目录。

## 约定

- 这里的 `D` 是**每个种子一个值**，由 3 位互不可见的裁判评该种子的匿名事实卡后取中位；
  三个种子的 D 再在 `finalize.py` 里取均值 ± 极差。
- 该文件是**审计留档**：只写不手改。要改分就重跑 `finalize.py`。
- 运行产物（trace/result/protocol/factcard/评分）不在这里，在 `runs/<名>/`，且被 `.gitignore` 排除。

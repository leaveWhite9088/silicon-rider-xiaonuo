# leaderboard/verdicts/

每个**规范模型 ID** 的裁判裁决原始记录，由 `src/scoring/finalize.py` 写入，一个模型一个文件：

```
leaderboard/verdicts/<规范模型ID>.json
{
  "model": "<规范模型ID>",
  "model_inputs": ["<原始 --model 标签>", "..."],
  "blind_pack_ids": ["...", "..."],
  "review_log": "leaderboard/reviews.jsonl",
  "d_source": "review_log",
  "d_aggregate": "mean",
  "finalized_at": "2026-...",
  "summary": { runs_total, runs_scored, judge_reviews, rounds_total },
  "runs": [ { run, pack_id, case_id, judge_count, rounds, seed_commit, seed_verified, replay_ok, profit, completed, endToEndMin, A, B, C, D, total } ],
  "mean":  { profit, A, B, C, D, total },
  "range_half": { ... }        # 极差的一半
}
```

## 模型 ID 与批次后缀

`judge_pack.py` 和 `finalize.py` 使用规范模型 ID 分组。末尾的已知批次后缀会被去掉：

- `deepseek-v4.1-flash-1017-h1` → `deepseek-v4.1-flash-1017`
- `deepseek-v4.1-flash-1017-s1` → `deepseek-v4.1-flash-1017`
- `deepseek-v4.1-flash-1017（Max）-h1` → `deepseek-v4.1-flash-1017（Max）`

支持的后缀包括 `-h`、`-h1`、`-s1`、`-a1`、`-b1` 这类单字母/数字批次，以及 `-batch1`、`-run1`、`-round1`、`-trial1`、`-seed1`、`-rep1` 等；`-v2` / `-ver2` 版本后缀和 `deepseek-r1` 这类模型名不会被误剥。无法自动判断或使用 `-r2` 等自定义后缀时，用 `--model-id <规范模型ID>` 显式指定；如果后缀完全自定义，可同时用 `judge_pack.py --model-id ... --runs ...` 显式指定归属。

## 中心评审日志

所有评委评分都通过 `src/scoring/judge_submit.py` 追加到：

```
leaderboard/reviews.jsonl
```

每行是一条评委提交，包含评分时间、评委 ID、评委模型、pack_id、case_id、D1/D2/D3、证据和备注。该文件只追加、不手改，且不会放进盲评包。

- `judge_submit.py` 不显示其他评委的评分；评委不得查看该日志。
- 同一 `(pack_id, case_id, judge_id)` 重复提交会被拒绝。
- `review_merge.py` 可按 mean/median 聚合日志；`finalize.py --review-log ... --d-aggregate mean|median` 可直接出榜。
- 每个 case 的评委人数不固定，可以分批到位。

## 盲评包与私有映射

`judge_pack.py` 会生成：

- `leaderboard/blind/<pack_id>/`：交给评委的唯一路径。内含匿名 `case-*.md`、`README.md`、`RUBRIC.md`、`SUBMIT.md` 和 `pack.json`；不含模型名、A/B/C、运行目录或种子明文。
- `leaderboard/verdicts/<规范模型ID>.<pack_id>.blind-map.json`：`case_id -> runs/<名>` 的私有映射，只给运行汇总的人 / `finalize.py`，**不能给评委**。映射内同时记录原始 `model` 和 `model_id`。

## 约定

- 这里的 `D` 是每个种子一个聚合值；每个 case 的 D 由其评委评分的 mean/median 得到，三个种子的 D 再在 `finalize.py` 里取均值 ± 极差。
- 该文件是**审计留档**：只写不手改。要改分就重跑 `finalize.py`。
- 运行产物（trace/result/protocol/factcard/评分）不在这里，在 `runs/<名>/`，且被 `.gitignore` 排除。
- 同一模型可以有多个盲评包；`finalize.py --model <任一批次名>` 会按规范模型 ID 自动发现所有映射和对应 run，按 run 合并计算均值。`judge_pack.py --model <带可识别批次后缀的名字>` 只打包该批，映射仍按规范模型 ID 命名。
- `summary.runs_total` = 该模型纳入汇总的总 run 数；`runs_scored` = 已有 D 评分的 run 数；`judge_reviews` = 评委提交条数；`rounds_total` = 所有 run 的模拟轮次总和。

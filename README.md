# Silicon Rider · xiaonuo

> **一句话**：让 AI 在会动的模拟城市里当 8 小时外卖骑手——在时间、电量、载重、时限，以及“不知道下一单从哪来”的约束下，把这一班的净利做到最大。

模拟引擎是第三方 MIT 组件（`src/engine/`，许可原文见其中 `LICENSE`），本仓库未改动其逻辑。本仓库是 `xiaonuo-v1.3.1` 赛制。

## 一局怎么跑

06:00 开局（在库 6–10 单）→ 每 5 分钟来 1–3 张新单 → 你接单 / 取货 / 送货 / 换电 → 14:00 收工。

| 规则 | 内容 |
| --- | --- |
| 供给 | 每 5 个**模拟分钟**一批新单；查询不推进时间，**刷查询刷不出单** |
| 时限 | 从**接单**那一刻起算：`deadline = 接单时刻 + timeLimit`；在库单另给 `expiresIn`（还能待几分钟） |
| 距离 | 2 分钟/km（畅通 30 km/h）；配送费 = 3.65 起步 + 4 km 以上每 km 1 元 + 商品价格费 |
| 资源 | 5 单 / 10 kg；电量 2%/km、满电 50 km；换电 1 分钟 + 0.5 元 |
| 时钟 | 840（14:00）后不再执行动作；400 轮上限 |

## 这套基准测什么

一句话：**约束下的目标达成能力**。不是答题，是在一个会动的世界里，用有限的时间和资源持续做取舍。

它拆成四件事，正好对应四个分数：

| 能力 | 分数 | 一句话 |
| --- | --- | --- |
| **结果达成** | A（30） | 能不能把机会换成钱 |
| **执行效率** | B（15） | 少犯错、少让人等 |
| **执行质量** | C（25） | 承诺的单准时送到、路别乱跑、状态别乱 |
| **决策智能** | D（30） | 挑单、组合、风险判断像不像老骑手 |

## 四个分数分别评什么

### A 任务成果（30）— 评“结果达成”

- **净利** = 完成订单实收 − 换电成本。
- `A = 30 × 净利 / 350`，封顶 30。350 是“专家可达上限”的估计（现实路由界 ≈492 的 71%）。
- 超过 350 会标 `A_out_of_range` 转人工复核，但不会再加分。
- 只看结果，不看过程。

### B 执行效率（15）— 评“执行效率”

- **B1 无效调用（5）**：失败调用 + 两次动作之间同参数重复查询，按比率分档（≤1% 9 级 …）。评**工具用得准不准**。
- **B2 耗时（10）**：端到端（选手开始 → 结果落盘），8 分钟满分，之后每 12 分钟减半。评**用户等多久**。`t0` 由选手开始前自行记录；传 `--t0` 或让驱动在进程启动时自动记录都有效。
- 两项都以 A 为上限封顶：没做对，不能靠“快”或“少调用”拿分。
- `t0_source=external`（命令传入）或 `process`（进程启动自动记录）只是来源诊断，不影响 B2 是否有效；单次流程没有额外协调角色。

### C 操作质量（25）— 评“执行可靠性”

- **C1 准时率（9）**：≥95% 满级；罚款 >15 元降 1 级、电量停摆降 2 级。评**守不守承诺**。
- **C2 状态一致性（8）**：对不存在 / 已过期 / 不在手上 / 地点不匹配的订单或换电操作扣级；引擎实际状态错误码已纳入。
- **C3 路径质量（8）**：总行驶里程 ÷ Σ(每单取餐点→送餐点距离)；只使用该 pathEfficiency，空驶率不参与评分。

### D 决策智能（30）— 评“决策”

- 唯一输入是 judge_pack.py 生成的**匿名盲评包目录**。评委只拿到 leaderboard/blind/<pack_id>/ 路径；包内不含模型名、A/B/C、运行目录或种子明文，模型到 case_id 的映射不交给评委。
- 评委用 `judge_submit.py` 提交，评分追加到中心日志 `leaderboard/reviews.jsonl`；该脚本不显示其他评委分数，评委不得查看中心日志。评委人数不固定，可分批到位。
- 汇总时用 `review_merge.py` 或 `finalize.py --review-log ... --d-aggregate mean|median` 聚合 D；每个 case 的评委数可不同。
- 本单次模式允许执行者跑完 3 局后自行运行 `score_run.py --no-record` 和 `judge_pack.py`；评委完成后由你手动运行 `finalize.py` 汇总。详见 `AGENTS.md` §0/§1。
- 同一模型多个三轮批次：`finalize.py --model <名>` 会按**规范模型 ID**自动发现所有映射和对应 run，按 run 合并；末尾批次后缀 `-h1` / `-s1` 等会归并，`（Max）` 等推理强度标记保留为独立模型。`summary` 记录 `runs_total / runs_scored / judge_reviews / rounds_total`。

## 谁起局

本仓库当前采用**单次执行者收尾模式**：选手先跑 3 局、自己运行 `score_run.py --no-record` 和 `judge_pack.py`；评委后评分；评委完成后由你手动运行 `finalize.py` 汇总。
有 shell 的 agent（DSH 等）**自己起局、自己调工具**；没有 shell 的纯 API 模型由运行器代持进程、只回 JSON 行。
规则与计分完全相同，区别只在“谁按下开始键”。
`t0` 由选手在开始工作前记录；不传 `--t0` 时，驱动会在进程启动时自动记录，二者都有效。

## 跑 3 轮 / 看排名

```sh
# 逐轮玩（像调用工具一样）：起局 → act → act → … → stop
node tools/session.mjs start --model Demo-s1 --seed-index 1
node tools/session.mjs act --session Demo-s1 '{"toolName":"move_to","parameters":{"targetLocationId":"node_22"}}'

# 或批量跑（写 policy，一条命令三局并发并评分）
node tools/play.mjs --model Demo --policy examples/policy-greedy.mjs --seeds 1,2,3 --score

# 跑完 3 局后：生成评分/事实卡（play --score 已做可跳过）
python src/scoring/score_run.py runs/Demo-s1 Demo --seed-index 1 --no-record
python src/scoring/score_run.py runs/Demo-s2 Demo --seed-index 2 --no-record
python src/scoring/score_run.py runs/Demo-s3 Demo --seed-index 3 --no-record

# 生成匿名盲评包和私有映射
python src/scoring/judge_pack.py --model Demo

# 评委提交：每位评委每个 case 提交一次；不要查看中心日志
python src/scoring/judge_submit.py --pack-dir leaderboard/blind/<pack_id> --case-id case-01 \
  --judge-id <评委ID> --judge-model <评委模型> \
  --D1 8 --D2 7 --D3 6 --evidence "[E01] [F02]" --note "最强反证"

# 可选：先查看中心日志的合并结果
python src/scoring/review_merge.py --log leaderboard/reviews.jsonl \
  --out leaderboard/reviews.merged.json --aggregate mean

# 手动汇总出榜：按规范模型 ID 自动发现所有 blind-map 和 run，合并多个三轮
python src/scoring/finalize.py --model Demo \
  --review-log leaderboard/reviews.jsonl \
  --d-aggregate mean --min-judges 1
# 部分 run 尚未评分时，可加 --allow-partial，只汇总已评分 run
```

- **排名**：[`leaderboard/scores.md`](leaderboard/scores.md)
  （GitHub：`https://github.com/leaveWhite9088/silicon-rider-xiaonuo/blob/main/leaderboard/scores.md`）
- **裁决留档**：`leaderboard/verdicts/<模型>.json`

## 目录

```
src/engine/     第三方 MIT 引擎（只读，许可见其中 LICENSE）
src/client/     会话驱动：起局、观察、调用、结算
src/scoring/    A/B/C 指标 + 事实卡、中心评审日志、评分入口、汇总、出榜
configs/        benchmark.json（唯一配置源）、seeds.commit.json（种子公开承诺）
tools/          harness（一句话开跑）、种子、物理界、回放核验
examples/       示例 policy（可直接改用）
docs/           protocol（规则）· scoring（计分）· design（设计与限制）
runs/           每次运行一个子目录（过程数据，不进库）
leaderboard/    榜单与裁决
```

## 版本

`xiaonuo-v1.3.1`，变更见 `CHANGELOG.md`；`src/engine/` 的第三方许可见 `src/engine/LICENSE`。

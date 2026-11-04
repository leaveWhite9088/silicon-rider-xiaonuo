# AGENTS.md

> 给进入本目录的 **AI 代理**看的操作说明。
> 本文件**不含种子**，也不要在别处去找它。
> （文档里出现的 `67890`、`12345` 只是历史示例，**不是**本批种子；每批种子由 `tools/gen_seeds.mjs` 现场生成、由评测环境保管。）

## 0. 先分清：你在「选手域」还是「评委/汇总」

这不是两个人，而是**两个信任域**。同一个 agent 可以既当选手又当开发者；本单次模式允许执行者运行**官方评分/打包脚本**，但**最终出榜和评委角色仍不能自己兼任**。

> **当前采用：单次执行者收尾模式。**
> 执行者（被测模型）跑完 3 个种子后，可以自行运行 `score_run.py --no-record` 生成 `评分.json` / `factcard.md`，并运行 `judge_pack.py` 生成匿名盲评包。本模式按单次会话使用，不要求跨批次复用或防作弊审计。
> 执行者仍然不能运行 `finalize.py`、不能写 `leaderboard/scores.md`、不能修改评分/打包脚本；评委只能拿到 `leaderboard/blind/<pack_id>/` 路径，`blind-map.json` 和 `reviews.jsonl` 不交给评委。

| 信任域 | 典型承担者 | 可以做什么 | 绝对不能做什么 |
| --- | --- | --- | --- |
| **选手域** | 被测模型（可能就是正在读这份文件的你） | 起局、逐轮手动调用工具、读观察、规划路线；跑完 3 局后运行官方 `score_run.py --no-record` 和 `judge_pack.py` | 决定种子、编写或运行代打脚本、运行 `finalize.py`、写排行榜/最终裁决、修改评分/打包脚本 |
| **评委/汇总** | 独立评委 / 运行汇总脚本的人 | 看匿名包、提交 D、评委完成后手动汇总入榜 | 替选手操作工具 |

### 三种部署形态，你是哪一种？

| 形态 | 谁起局/喂工具 | 谁打 t0 | 谁跑官方评分 | 你该读 |
| --- | --- | --- | --- | --- |
| **A. 单代理**（agent 有 shell，自己起局自己玩，本仓库最常见） | 你（选手） | 你在开始前自记（进程启动或 `--t0` 传入） | 你跑 `score_run.py --no-record` + `judge_pack.py`；评委后由你手动 `finalize.py` | §1、§3 |
| **B. 双代理**（一个进程当运行器，另一个模型只回 JSON） | 运行器 | 运行器 | 运行器 | §1 或 §2 |
| **C. 官方运行器**（模型只有 API，没有 shell） | 运行器 | 运行器 | 运行器 | §1 |

**单代理形态的硬约束（缺一即成绩无效）**：

1. **种子不在你手里**：由评测环境提供；你只拿到"第几个种子"或一个数字，事后核对承诺。
2. **`t0` 由你在开始工作前记录**：可以直接传 `--t0`，也可以让驱动在进程启动时自动记录；两者都是有效的 B2 起点。
3. **最终出榜在评委完成后手动做**：本单次模式允许你运行 `score_run.py --no-record` 和 `judge_pack.py`；`finalize.py`、`leaderboard/scores.md` 和最终裁决等评委提交后再手动运行。

> 本单次模式没有额外协调角色：选手先做，评委后做，最后手动运行汇总脚本。

> **本版玩法硬规则：只允许逐轮手动玩。**
> 不得编写、生成、修改或运行任何自行编写的脚本，包括策略脚本、代打脚本、自动决策程序、自动工具调用循环；不得使用 `tools/play.mjs --policy`、`tools/harness.mjs --policy` 或其他自动化方式代打。
> 每一次行动都必须由你读取上一条观察后手动决定，并单独发起一次工具调用；违反此规则的 run 成绩无效。
> 官方 `score_run.py`、`judge_pack.py`、`finalize.py` 等评分/打包工具不属于代打，按本文规定流程运行即可。

---

## 1. 选手域：上场怎么打

### 三分钟上手（执行者只看这一节）

在**仓库根目录**执行；你的名字由启动命令指定（例：`deepseek-v4`），三个种子就是三个会话：

```sh
# 起第 1 局（返回第一条观察）
node tools/session.mjs start --model deepseek-v4-s1 --seed-index 1

# 每轮：看返回的观察 → 决定一个工具 → act 一次（= 一次真实调用，时间会前进）
node tools/session.mjs act --session deepseek-v4-s1 '{"toolName":"move_to","parameters":{"targetLocationId":"node_22"}}'

# 随时看状态 / 收工
node tools/session.mjs state --session deepseek-v4-s1
node tools/session.mjs stop  --session deepseek-v4-s1
```

- 第 2、3 局同样起，换成 `-s2 / -s3` 和 `--seed-index 2 / 3`；**三个会话可并行**。
- 每次 `act` 返回新观察 + `advanced`（本次推进多少分钟）。返回 `ended: true` 就是 14:00 收工了。
- **跑完 3 局后按下方「执行者收尾」运行官方评分和匿名打包脚本**；不要运行 `finalize.py` 或写排行榜。

- **正式玩法只允许逐轮手动操作，禁止使用 `play.mjs --policy` / `harness --policy` 或任何策略脚本一次跑完。** 这两个入口仅供开发调试，其产物不能作为正式成绩。

### 跑完三局后：执行者收尾（本模式）

本单次模式要求执行者自己完成官方脚本评分和匿名打包，不要求跨批次复用：

1. 对 3 个 run 分别生成 A/B/C 和事实卡（不写排行榜）：

```sh
python src/scoring/score_run.py runs/<名>-s1 <名> --seed-index 1 --no-record
python src/scoring/score_run.py runs/<名>-s2 <名> --seed-index 2 --no-record
python src/scoring/score_run.py runs/<名>-s3 <名> --seed-index 3 --no-record
```

2. 生成匿名盲评包：

```sh
python src/scoring/judge_pack.py --model <名>
```

输出：

- `leaderboard/blind/<pack_id>/`：交给评委的唯一路径；
- `leaderboard/verdicts/<规范模型ID>.<pack_id>.blind-map.json`：私有映射，不交给评委。

3. 把 `leaderboard/blind/<pack_id>/` 路径交给评委；**不要**把 `blind-map.json`、`reviews.jsonl`、`runs/` 或 A/B/C 交给评委。

4. 执行者不要运行 `finalize.py`，不要写 `leaderboard/scores.md`；评委提交后由你手动运行汇总脚本出榜。

你在一场 480 分钟（06:00–14:00）的外卖班次里跑单，目标是**班次净利最大**。

### 输入输出协议

- 每轮收到**一行 JSON 观察**：`minute`、`battery`、`position`、`weight`、`remainingCapacity`、`profit`、`carried`、
  `openOrders`（每条含 `fee`、`dist`、`pickup`、`delivery`、`timeLimit`、`createdAt`、`weight`、**`expiresIn`**——还能在库里待几分钟）。
- 每轮只回**一行 JSON 工具调用**，不要解释、不要多行、不要 markdown：

```json
{"toolName":"move_to","parameters":{"targetLocationId":"node_22"}}
{"toolName":"accept_order","parameters":{"orderId":"order_7"}}
{"toolName":"pickup_food","parameters":{"orderId":"order_7"}}
{"toolName":"deliver_food","parameters":{"orderId":"order_7"}}
{"toolName":"swap_battery","parameters":{}}
{"toolName":"wait","parameters":{"minutes":5}}
{"toolName":"search_nearby_battery_stations","parameters":{"radius":8}}
```

- 特殊命令（不是 JSON）：`status` = 重打完整状态（不计轮数）；`quit` = 提前收工（记为 `model_stopped_early`，一般不要用）。

### 必须记住的六条规则

1. **时限从接单那一刻起算**：`deadline = 接单时刻 + timeLimit`；观察里 `carried[].deadline` 就是真值。
2. **接单不要求你在店里，取货要求**。所以"先骑到店门口、再接单、再取货"，把空驶挪到时限之外——合法且关键。
3. **新单按模拟时间到**（每 5 分钟一批）；查询工具**不推进时间**，刷查询刷不出订单。
4. **时钟 840（14:00）后不再执行动作**；越线动作会被拒绝（`--clock-cap reject`）或白跑（默认）。
5. 上限 400 轮；承载 5 单 / 10 kg；电量 2%/km（满电 50 km）；换电 1 分钟 + 0.5 元。
6. 配送费 = 3.65 起步 + 距离费（4 km 以上每 km 1 元）+ 商品价格费（超市/药店单最肥）+ 06:00–07:00 接单 +1 元。

### 允许 / 禁止

- ✅ 任意顺序使用 13 个工具；合单、拒单、提前换电、等好单；但每一步都必须读取当前观察后手动决定并逐轮调用。
- ❌ 读或推断**种子**（`$SR_SEEDS` 指向的明文、`protocol.json` 的 `seed_commit`、其他 `runs/*/trace.jsonl`）；❌ 推演/重现未来订单流；❌ 改引擎/驱动；❌ 伪造轨迹；❌ 写结算或榜单。
- ❌ 编写或运行任何自行编写的策略/代打脚本、自动决策程序或自动工具调用循环；❌ 使用 `play.mjs --policy` / `harness --policy` 或其他自动化方式代打（正式成绩无效；官方评分/打包脚本除外）。
- 判罚：种子承诺不匹配 = 作废；轨迹会**用原引擎逐条重放**，结算必须一致。

### 打法提示（经验，不是规则）

- 挑"单位时间收入"高的单：`fee ÷ (2×(接驾km + 送餐km) + 3分)`；≥0.7 好单，<0.5 只有顺路才接。
- 合单看**最紧的那单**：从接单到第一单送达必须 < 该单时限 − 3 分；取餐点扎堆、送餐点同向才值得合。
- 电量按"下一趟之前够不够"规划；剩续航 < 本趟里程 + 5 km 就先换电。
- 班末 20 分钟只接能送完的单：最后一趟必须 13:58 前送完。

---

## 2. 评委与手动汇总

评委或汇总者需要读这节；如果你只是选手，跳到 §3。

### 标准流程（评委与手动汇总）

执行者怎么玩见 §1（只能逐轮手动玩；禁止 policy/脚本代打）。评委只评分；汇总脚本在评委提交后手动运行。

> 本单次执行者收尾模式下，步骤 1（`score_run.py`）和步骤 2（`judge_pack.py`）可由执行者自己运行；评委提交后由你手动运行 `finalize.py` 出榜。

```sh
# 1) 评分（每个种子跑一次；核对承诺 + 写事实卡；执行者自跑请加 --no-record）
python src/scoring/score_run.py runs/<名>-s1 <名> --seed-index 1

# 2) 生成匿名盲评包：输出一个 leaderboard/blind/<pack_id>/ 目录
python src/scoring/judge_pack.py --model <名>
#    → 只把这个目录路径交给评委；不要让评委看到仓库、模型名、A/B/C 或私有映射
#    → 评委用 judge_submit.py 按 case 提交；评分追加到中心日志
#    → 评委不得查看 leaderboard/reviews.jsonl 或其他评委评分

# 3) 出榜：按规范模型 ID 自动发现所有 blind-map 和 run，合并多个三轮
#    不填 --runs / --blind-map 时，会按 --model 自动发现
python src/scoring/finalize.py --model <名> \
    --review-log leaderboard/reviews.jsonl \
    --d-aggregate mean --min-judges 1
# 部分 run 尚未评分时，可加 --allow-partial，只汇总已评分 run
```

需要先查看合并结果：`python src/scoring/review_merge.py --log leaderboard/reviews.jsonl --out leaderboard/reviews.merged.json --aggregate mean`。

- **并发是安全的**：每局一个独立进程、独立输出目录、独立种子，互不共享状态。
- 执行者只需要知道"用第 1/2/3 个种子"，不需要也不应该读种子明文。

`scripts/score_all.ps1 -SeedsFile seeds.json -Prefix <名>` 可把"评分 + 汇总"一次做完（按承诺哈希自动匹配种子）。

### 必须守的环境规则

- `seeds.json`、`src/engine/`、`runs/` **不要**放进被测模型可达的目录；真隔离靠容器/另一个账号，不靠"请不要看"。
- 一个种子只跑一次；跑完别再用它调参（同种子调参 = 背答案）。换批就换新种子。
- `t0` 由选手在开始工作前自行记录；命令传入或进程启动时间都有效，`t0_source` 只作诊断。
- leaderboard/reviews.jsonl 是中心评分日志；评委只能通过 judge_submit.py 追加，不应有读取权限。

### 产物异常排查

| 现象 | 先查 |
| --- | --- |
| `t0_source=process` | 表示 t0 来自进程自动记录，不是无效；B2 仍按端到端计算 |
| 只有 `trace.jsonl`，没有 `result.json` | 驱动被强杀；重跑 |
| `seed_verified=false` | 种子传错 → 该次作废 |
| `A_out_of_range=true` | 净利打穿锚值 → 人工复核，考虑重标锚 |
| 事实卡标"疑似脚本代打" | 中位调用间隔 <300ms；本版禁止脚本代打，该次成绩无效，需人工复核 |
| 分数异常偏低 | 看 B2 是否被端到端拖累、C1 准时率、C3 绕路 |

---

## 3. 开发者：改这个 benchmark 时

### 布局与单一配置源

- 配置只改 `configs/benchmark.json`（场景/供给/时钟/轮数/评分常量）；代码里不要硬编码阈值。
- 代码：`src/client/`（驱动）、`src/scoring/`（指标/评分/汇总）、`src/engine/`（第三方 MIT 引擎，只读；唯一例外是为 `help` 补回的 `client/system-prompt.js`，不含逻辑改动）、`tools/`。
- 文档必须同步：`docs/protocol.md`（规则）、`docs/scoring.md`（计分）、`docs/design.md`（设计与债务）。

### 不变量（改之前先想清楚）

| 不变量 | 为什么 |
| --- | --- |
| `trace.jsonl` 事件类型 `initial` / `tool` / `tick` / `result` | 指标与回放工具依赖 |
| A/B/C 公式与分档（除 B2 计时来源） | 与历史批次可比；改了就重开版本号 |
| 事实卡字段（E/F/G/H/I 行） | 独立评审的锚点依赖 |
| 一次调用 = 一个 `round` | 400 轮上限与"每 5 分钟一批"都按它计 |

### 改动流程

1. 改代码 → 2. `node --check` / `py_compile` → 3. `pwsh tests/smoke.ps1` → 4. 更新 `docs/` + `CHANGELOG.md` → 5. 若动到供给/计时/锚值，**重标锚并升版本号**（不同版本成绩分开归档）。

### 已知债务（别装作不存在）

- 端到端计时包含人为停顿；更精确的做法是 `Σ 每轮模型推理耗时`。

---
## 4. 如果你是「D 层评审」

- **唯一输入**：`leaderboard/blind/<pack_id>/` 盲评包目录里的 `case-*.md`。不要访问仓库、`runs/`、`leaderboard/` 其他目录，也不要看模型名、A/B/C、净利或原始 trace。
- 按绝对锚点定级，**不与他人比较**；每格引用 ≥2 条卡面证据（如 `[E05]`、`[F01]`、`[I02]`）。
- 三维度：**D1 挑单与收益取舍 11**、**D2 组合与动态调整 10**、**D3 风险权衡与班次管理 9**。
- 必须写"最强反证"；提交用 `judge_submit.py`，每次一个 case，追加到中心日志。
- 常见扣分证据：死单 / 收班在途 / 超时滞留 / 状态错误 / 电量停摆 / 大幅绕路 / 低分位接单集中在后半班。

### 4.1 中心化追加评审

- 所有评分只通过 `judge_submit.py` 追加到 `leaderboard/reviews.jsonl`，不得手改历史行。
- `judge_submit.py` 只校验并追加，不显示其他评委的评分；盲评包 README/RUBRIC/SUBMIT 都明确要求评委不要查看中心日志。
- 评委人数不固定，可以分批到位；后到评委不得查看先到评委的评分。
- 汇总时用 `review_merge.py` 查看聚合，或用 `finalize.py --review-log ... --d-aggregate mean|median` 直接出榜。
- 评委模型的评分、时间、pack/case 和 D1/D2/D3 都会写入中心日志，便于审计和后续重算。


### 4.2 同一模型多个三轮

- 每跑一个三轮批次，`judge_pack.py` 生成一个独立盲评包和私有映射：`leaderboard/verdicts/<规范模型ID>.<pack_id>.blind-map.json`。
- 汇总按**规范模型 ID**：末尾批次后缀（如 `-h1` / `-s1`）会归并，`（Max）` 等推理强度标记保留；无法自动识别时用 `--model-id` 显式指定。
- `finalize.py` 自动发现该规范模型 ID 的所有映射和对应 run，按 run 合并计算均值；也可以用 `--runs` / `--blind-map` 显式指定。
- 默认要求所有自动发现的 run 都有 D 评分；加 `--allow-partial` 可只汇总已有评分的 run。
- `leaderboard/verdicts/<规范模型ID>.json` 的 `summary` 会记录：`runs_total`（总 run 数）、`runs_scored`（已评分 run 数）、`judge_reviews`（评委提交条数）、`rounds_total`（所有 run 的模拟轮次总和）。
**历史批次记录（旧槽位流程，仅留档）**：

- 2026-11-04 `glm-5.3-flash` / `deepseek-v4.1-flash` 各 3 种子批次：**评委 1（槽位 0）** 已由执行代理完成，
  盲评包 `leaderboard/blind/4c899c00bfe5/`（glm）与 `leaderboard/blind/b557e1317645/`（deepseek），每包 3 案；评委 2/3 待安排。
  **披露**：评委 1 与被测模型 `glm-5.3-flash` 同族模型，且执行过评分管线、见过脚本层 A/B/C 与 `blind-map`，
  其 D 分存在同族立场与结果光环风险；采信时建议以 3 位评委合并结果为准，必要时刻意核对 glm 包槽位 0 是否系统性偏高。

---

## 5. 文件地图

| 路径 | 谁写 | 谁读 |
| --- | --- | --- |
| `configs/benchmark.json` | 开发者 | 驱动、指标 |
| `src/client/rider_client.mjs` | 开发者 | 选手域（起局） |
| `src/scoring/*.py` | 开发者 | 评分/汇总 |
| `runs/<名>/{trace,result,protocol}` | 驱动 | 评分/汇总、回放核验 |
| `runs/<名>/{factcard,评分}` | 评分脚本 | 评审、评分/汇总 |
| `leaderboard/scores.md` | 评分脚本（评分/汇总） | 所有人 |
| `seeds.json`（仓库外） | 评测环境 | **任何人都不该在选手可达目录** |
| `leaderboard/blind/<pack_id>/` | `judge_pack.py` | 评委（只给这个目录路径） |
| `leaderboard/verdicts/<规范模型ID>.<pack_id>.blind-map.json` | `judge_pack.py` | 运行 finalize 的人 / `finalize.py`，**评委不可见** |
| `leaderboard/reviews.jsonl` | `judge_submit.py` | 运行汇总的人 / `review_merge.py` / `finalize.py`，**评委不可读** |
| `src/scoring/judge_submit.py` | 开发者 | 评委提交入口（只追加、不回显他人分数） |
| `src/scoring/review_merge.py` | 开发者 | 汇总中心日志 |

## 6. 命令速查

```sh
node tools/gen_seeds.mjs --n 3 --out seeds.json                 # 预注册种子（评测环境）
pwsh scripts/run_session.ps1 -Model Demo -Seed <种子> -T0 <ISO>  # 起一班（t0 由选手开始前自记）
python src/scoring/score_run.py runs/Demo Demo --seed <种子>      # 评分（执行者自跑）
python src/scoring/judge_pack.py --model Demo                # 生成匿名盲评包
python src/scoring/judge_submit.py --pack-dir <包目录> ...    # 评委追加评分（中心日志）
python src/scoring/review_merge.py --log leaderboard/reviews.jsonl --aggregate mean  # 汇总查看
python src/scoring/aggregate.py --prefix runs/Demo               # 多种子汇总
node tools/bounds.mjs --seed <种子>                              # 锚值标定
node tools/verify_replay.mjs runs/<名> --seed <种子>              # 回放核验（结算须逐字段一致）
pwsh tests/smoke.ps1                                            # 自检（提交前必跑）
```

**收工前自查**：红线没碰？测试跑过？文档同步？种子没进库？**有没有自己给自己当裁判？**

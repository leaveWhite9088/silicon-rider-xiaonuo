# AGENTS.md

> 给进入本目录的 **AI 代理**看的操作说明。
> 本文件**不含种子**，也不要在别处去找它。
> （文档里出现的 `67890`、`12345` 只是历史示例，**不是**本批种子；每批种子由 `tools/gen_seeds.mjs` 现场生成、由主控保管。）

## 0. 先分清：你在「选手域」还是「裁判域」

这不是两个人，而是**两个信任域**。同一个 agent 可以既当选手又当开发者，但**不能自己当自己的裁判**。

| 信任域 | 典型承担者 | 可以做什么 | 绝对不能做什么 |
| --- | --- | --- | --- |
| **选手域** | 被测模型（可能就是正在读这份文件的你） | 起局、调工具、写脚本代打、读观察、规划路线 | 决定种子、给自己打 `t0`、写排行榜/评分 |
| **裁判域** | 主控 / 运行者 / 评审 | 生成并保管种子、打 `t0`、跑评分、评审、入榜 | 替选手操作工具 |

### 三种部署形态，你是哪一种？

| 形态 | 谁起局/喂工具 | 谁打 t0 | 谁跑官方评分 | 你该读 |
| --- | --- | --- | --- | --- |
| **A. 单代理**（agent 有 shell，自己起局自己玩，本仓库最常见） | 你（选手） | **外部**（主控/Harness） | **外部**（或你跑 `--no-record`，主控复核后入榜） | §1、§3 |
| **B. 双代理**（一个进程当运行器，另一个模型只回 JSON） | 运行器 | 运行器 | 运行器 | §1 或 §2 |
| **C. 官方运行器**（模型只有 API，没有 shell） | 运行器 | 运行器 | 运行器 | §1 |

**单代理形态的唯一硬约束（三条，缺一即成绩无效）**：

1. **种子不在你手里**：由主控生成并保管；你只拿到"第几个种子"或一个数字，事后核对承诺。
2. **`t0` 不是你打的时间戳**：必须由主控/Harness 在你开始工作**之前**记下并传给你（`--t0`）。自己按一下开始键再开始工作，B2 就失真了。
3. **官方评分与入榜不是你做**：你可以跑 `score_run.py --no-record` 自检，但 `leaderboard/scores.md` 只能由主控（或主控授权的批处理）写。

> 为什么这么严？因为**能自我裁决的评测等于没有评测**：自己起局、自己计时、自己评分，B2 就失去意义。

---

## 1. 选手域：上场怎么打

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

- ✅ 任意顺序使用 13 个工具；合单、拒单、提前换电、等好单；**可以写脚本代打**（代价是端到端时间，直接压低 B2）。
- ❌ 读或推断**种子**（`seeds.json`、`protocol.json` 的 `seed_commit`、其他 `runs/*/trace.jsonl`）；❌ 推演/重现未来订单流；❌ 改引擎/驱动；❌ 伪造轨迹；❌ 写结算或榜单。
- 判罚：种子承诺不匹配 = 作废；轨迹会**用原引擎逐条重放**，结算必须一致。

### 打法提示（经验，不是规则）

- 挑"单位时间收入"高的单：`fee ÷ (2×(接驾km + 送餐km) + 3分)`；≥0.7 好单，<0.5 只有顺路才接。
- 合单看**最紧的那单**：从接单到第一单送达必须 < 该单时限 − 3 分；取餐点扎堆、送餐点同向才值得合。
- 电量按"下一趟之前够不够"规划；剩续航 < 本趟里程 + 5 km 就先换电。
- 班末 20 分钟只接能送完的单：最后一趟必须 13:58 前送完。

---

## 2. 裁判域：怎么保证公平

只有主控/运行者/评审需要读这节；如果你只是选手，跳到 §3。

### 标准流程

```sh
# 1) 生成并保管种子（承诺可公开，明文只在你手里）
node tools/gen_seeds.mjs --n 3 --out seeds.json

# 2) 在把任务交给模型之前记下 t0，再起局
pwsh scripts/run_session.ps1 -Model <名>-s1 -Seed <种子> -T0 <ISO 时刻>

# 3) 用种子核对承诺后评分
python src/scoring/score_run.py runs/<名>-s1 <名> --seed <种子>

# 4) 三个种子汇总
python src/scoring/aggregate.py --prefix runs/<名>

# 5) 换种子时重标锚值，写回 configs/benchmark.json → scoring.anchor_yuan
node tools/bounds.mjs --seed <种子>
```

`scripts/score_all.ps1 -SeedsFile seeds.json -Prefix <名>` 可把"评分 + 汇总"一次做完（按承诺哈希自动匹配种子）。

### 必须守的环境规则

- `seeds.json`、`src/engine/`、`runs/` **不要**放进被测模型可达的目录；真隔离靠容器/另一个账号，不靠"请不要看"。
- 一个种子只跑一次；跑完别再用它调参（同种子调参 = 背答案）。换批就换新种子。
- `t0` 必须在"把任务发给模型"之前取，不能用进程启动时间顶替。

### 产物异常排查

| 现象 | 先查 |
| --- | --- |
| `t0_source=process` / `b2_reliable=false` | t0 是驱动自己按的 → B2 不可信；用裁判域给的 `--t0` 重跑 |
| 只有 `trace.jsonl`，没有 `result.json` | 驱动被强杀；重跑 |
| `seed_verified=false` | 种子传错 → 该次作废 |
| `A_out_of_range=true` | 净利打穿锚值 → 人工复核，考虑重标锚 |
| 事实卡标"疑似脚本代打" | 中位调用间隔 <300ms；本版允许，但已计入端到端 |
| 分数异常偏低 | 看 B2 是否被端到端拖累、C1 准时率、C3 绕路 |

---

## 3. 开发者：改这个 benchmark 时

### 布局与单一配置源

- 配置只改 `configs/benchmark.json`（场景/供给/时钟/轮数/评分常量）；代码里不要硬编码阈值。
- 代码：`src/client/`（驱动）、`src/scoring/`（指标/评分/汇总）、`src/engine/`（上游，只读；唯一例外是为 `help` 补回的 `client/system-prompt.js`，不含逻辑改动）、`tools/`。
- 文档必须同步：`docs/protocol.md`（规则）、`docs/scoring.md`（计分）、`docs/design.md`（设计与债务）。

### 不变量（改之前先想清楚）

| 不变量 | 为什么 |
| --- | --- |
| `trace.jsonl` 事件类型 `initial` / `tool` / `tick` / `result` | 指标与回放工具依赖 |
| A/B/C 公式与分档（除 B2 计时来源） | 与历史批次可比；改了就重开版本号 |
| 事实卡字段（E/F/G/H/I 行） | 3 位评审的锚点依赖 |
| 一次调用 = 一个 `round` | 400 轮上限与"每 5 分钟一批"都按它计 |

### 改动流程

1. 改代码 → 2. `node --check` / `py_compile` → 3. `pwsh tests/smoke.ps1` → 4. 更新 `docs/` + `CHANGELOG.md` → 5. 若动到供给/计时/锚值，**重标锚并升版本号**（不同版本成绩分开归档）。

### 已知债务（别装作不存在）

- `metrics.py` 的 `emptyRatio` 恒为 `None`（读的是驱动从不写的 `executed` 字段），C3 实际只看路径效率。
- 端到端计时包含人为停顿；更精确的做法是 `Σ 每轮模型推理耗时`。

---

## 4. 如果你是「D 层评审」

- **唯一输入**：`runs/<名>/factcard.md`。不要读净利，也不要读原始 trace（防结果光环）。
- 按绝对锚点定级，**不与他人比较**；每格引用 ≥2 条卡面证据（如 `[E05]`、`[F01]`、`[I02]`）。
- 三维度：**D1 挑单与收益取舍 11**、**D2 组合与动态调整 10**、**D3 风险权衡与班次管理 9**。
- 必须写"最强反证"；同卡 3 位评审独立评取中位；极差 ≥3 级转仲裁。
- 常见扣分证据：死单 / 收班在途 / 超时滞留 / 状态错误 / 电量停摆 / 大幅绕路 / 低分位接单集中在后半班。

---

## 5. 文件地图

| 路径 | 谁写 | 谁读 |
| --- | --- | --- |
| `configs/benchmark.json` | 开发者 | 驱动、指标 |
| `src/client/rider_client.mjs` | 开发者 | 选手域（起局） |
| `src/scoring/*.py` | 开发者 | 裁判域 |
| `runs/<名>/{trace,result,protocol}` | 驱动 | 裁判域、回放核验 |
| `runs/<名>/{factcard,评分}` | 评分脚本 | 评审、裁判域 |
| `leaderboard/scores.md` | 评分脚本（裁判域） | 所有人 |
| `seeds.json`（仓库外） | 主控 | **任何人都不该在选手可达目录** |

## 6. 命令速查

```sh
node tools/gen_seeds.mjs --n 3 --out seeds.json                 # 预注册种子（裁判域）
pwsh scripts/run_session.ps1 -Model Demo -Seed <种子> -T0 <ISO>  # 起一班（t0 由裁判域给）
python src/scoring/score_run.py runs/Demo Demo --seed <种子>      # 评分（裁判域）
python src/scoring/aggregate.py --prefix runs/Demo               # 多种子汇总
node tools/bounds.mjs --seed <种子>                              # 锚值标定
node tools/verify_replay.mjs runs/<名> --seed <种子>              # 回放核验（结算须逐字段一致）
pwsh tests/smoke.ps1                                            # 自检（提交前必跑）
```

**收工前自查**：红线没碰？测试跑过？文档同步？种子没进库？**有没有自己给自己当裁判？**

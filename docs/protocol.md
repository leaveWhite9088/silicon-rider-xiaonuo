# 赛制与工具 · silicon-rider-xiaonuo v1.2

> 本文件是**给运行者/评审看的协议说明**；被测模型只拿到「一行观察 ↔ 一行工具调用」的交互循环。

## 1. 世界

- 480 分钟班次：06:00–14:00（引擎时钟 360 → 840）。
- 100 个节点（餐厅 35、居民区 25、写字楼 11、超市 13、药店 7、换电站 9），网格状路网。
- 移动耗时 = 距离 / 速度：拥堵 <0.3 时 30 km/h（≈2 分钟/km），0.3–0.5 时 25，0.5–0.7 时 20，≥0.7 时 15；7:00–9:00 地图边缘道路 +0.3 拥堵。
- 电量 2%/km，满电 50 km；换电 1 分钟 + 0.5 元，恢复 100%。
- 承载：最多 5 单 / 10 kg。取货 2 分钟、送货 1 分钟。

## 2. 订单与时限

- **供给按模拟时间**：每 5 个模拟分钟的**整点**生成 1–3 张新单（出生时刻 = 批次时刻，不是某个动作结束时刻）；查询工具不推进时间，所以**查不出新单**。
- **在库单会自己过期**：从生成起超过 `timeLimit` 分钟就从池子里消失（不会另行通知）。
  观察里每条在库单都带 `expiresIn`（还能待几分钟），接不接、要不要先跑过去，由你判断。
- **时限自接单起算**：`deadline = 接单时刻 + timeLimit`。观察里 `carried[].deadline` 就是真值。
- 配送费 = 起步 3.65（≤3 km）+ 距离费（3–4 km 每 0.1 km +0.15；>4 km 每 0.1 km +0.1）+ 商品价格费 + 时段费（06:00–07:00 接单 +1 元）。
- 超时罚款：超 ≤5 分钟不扣；5–10 分钟扣 30%；10–15 分钟扣 50%；>15 分钟扣 70%。

## 3. 工具（13 个）

> 全部在库单已在每轮观察里给出，因此**不再提供“搜单”工具**。调用未暴露的工具会被判为 `TOOL_DISABLED` 并计入无效调用。

| 类别 | 工具 | 说明 |
| --- | --- | --- |
| 查询（不推进时间） | `get_my_status` | 位置/电量/在途单/载重/利润 |
| | `search_nearby_battery_stations` | 半径内换电站 |
| | `get_location_info` | 节点信息与邻居 |
| | `calculate_distance` | 两节点最短路距离 |
| | `estimate_time` | 给定路径的通行时间 |
| | `get_map` | 全图（按类型分组 + 邻接表） |
| | `help` | 系统提示词 |
| 动作（推进时间） | `accept_order` | 接单（立即起算时限，不计时） |
| | `move_to` | 移动 |
| | `pickup_food` | 取货（需在取餐点） |
| | `deliver_food` | 送货（需在送餐点，结算） |
| | `swap_battery` | 换电（需在换电站） |
| | `wait` | 原地等待 N 分钟（1–60，期间按 5 分钟一批生单） |

- 每轮输出一行 JSON：

```json
{"toolName":"move_to","parameters":{"targetLocationId":"node_22"}}
```

- **工具返回的数据单列一行** `[result] {...}`（查询结果、移动耗时、结算金额都在这里）；
  轮次的观察仍是 `{"minute":...}` 那一行。两行一起看。
- 在途单的取送点同时给 `pickup/delivery` 与 `pickupLocation/deliveryLocation`（等价），与在库单字段对齐。

特殊命令：`status`（重打完整状态，不计轮数）、`quit`（提前收工结算）。

## 4. 结算与终止

- 时钟 ≥840 后不再执行任何动作（`--clock-cap reject` 时会提前拒绝“会越线”的动作，避免拖堂）。
- 轮数上限 400（`rounds.max`）。
- 收工时仍在手上的单不计收入；`result.json` 的 `snapshot` 与 `score` 即最终结算。

## 5. 计分

见 `docs/scoring.md`。要点：

- **A30** 净利 / 锚值（`configs/benchmark.json`，默认 350；打穿锚值会报警并转人工复核）。
- **B15** = 无效调用 5（失败 + 动作间同参数重复查询）+ **端到端**耗时 10。
- **C25** = 准时率 9 + 状态一致性 8 + 路径效率 8。
- **D30** = 匿名盲评包 × 3 位独立评审取中位；评委只拿 `leaderboard/blind/<pack_id>/` 路径，包内无模型名/A/B/C。

## 6. 种子与诚信

- 种子**对被测模型保密、对裁判公开**：`protocol.json` 只写 `sha256("sr:"+seed)`。
- 评分时用 `--seed` 核对；不匹配即作废。
- 建议每批 3 个预注册种子（`tools/gen_seeds.mjs`），报均值 ± 极差。
- 所有动作必须走工具接口；禁止修改引擎/驱动/评分脚本；禁止手写 `result.json`。
- **禁止推演**：不得尝试反推种子、重现订单流或预知未来订单（例如穷举种子、离线模拟未来批次）。核验时若发现路线/接单与未来订单异常吻合，D 层按 0 分处理或取消该次成绩。
- 轨迹可用原引擎逐条重放核验：`node tools/verify_replay.mjs runs/<名> --seed <种子>`，结算必须与 `result.json` 完全一致。

## 7. 运行

```sh
# 种子已预注册：--seed-index 取序号即可，执行者不需要接触明文
node tools/harness.mjs --model Demo-s1 --seed-index 1 --policy examples/policy-greedy.mjs

# 评分（核对承诺）
python src/scoring/score_run.py runs/Demo-s1 Demo --seed-index 1

# 匿名盲评包 → 填 D → 出榜
python src/scoring/judge_pack.py --model Demo
python src/scoring/finalize.py --model Demo --runs runs/Demo-s1 runs/Demo-s2 runs/Demo-s3 \
       --seed-indexes 1,2,3 --d-file leaderboard/blind/<pack_id>/verdict.draft.json \
       --blind-map leaderboard/verdicts/Demo.blind-map.json

# 换批才需要重标锚值（本批固定种子，不换）
node tools/bounds.mjs --seed-index 1
```

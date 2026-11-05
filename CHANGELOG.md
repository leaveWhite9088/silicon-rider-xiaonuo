# CHANGELOG

## v1.4 — 2026-11-04

订单供给分布改造：午高峰 + 空间聚簇（**与 v1.3.1 的成绩不可混排**）。

### 变更

- 新增客户端模块 `src/client/order_distribution.mjs`：**不改 `src/engine/`**，在客户端对新生订单做重分布。
  - 午高峰 11:30–13:00（模拟分钟 690–780）供给倍率 ×3，其余时段不变。
  - 空间聚簇：餐饮/超市/药店各自选取热点取餐节点，住宅/写字楼选取热点送货片区，新单按 `hotShare`（默认 0.7）落入热点；重算 distance / deliveryFee / timeLimit，口径与引擎一致。
  - 由种子决定，`rider_client.mjs` 与 `tools/verify_replay.mjs` **共用同一模块与同一配置**，回放逐字段一致。
- `configs/benchmark.json`：新增 `distribution` 配置块；版本升至 `xiaonuo-v1.4`。
- 锚值 `anchor_yuan` 由 350 调整为 **500**。理由：实测最高净利 425.9，350 会让最好两局同时封顶并列；1000 会把 A 压到 6–13 分失去可解释性；500 保证不饱和。
- 已验证**改锚值不改变区分度**（1000→500 时信噪比 1.39→1.18，且前 3 名排序翻转），故不得用调锚值来制造分差；最终锚值仍待 `tools/bounds.mjs` 复核。
- `protocol.json` 记录生效的 `distribution` 配置，回放按该配置重放。
- 改造的目标与验收门槛见根目录 `改造验收标准.md`。

### 注意

- 旧种子因订单流改变而失效：v1.4 需要重新生成种子批次并重标锚值。
- 午高峰在库单量峰值显著上升（冒烟局约 62 张），单条观察体积由约 7.4KB 增至约 19.7KB，属于已知副作用，可通过 `distribution.peak.multiplier` 调整。

## v1.3.1 — 2026-11-04

B2 计时口径修正。

### 变更

- t0 由选手在开始工作前自行记录：命令传入 --t0 或驱动在进程启动时自动记录都有效；t0_source 只作诊断，不再因 process 将 B2 标为不可信。
- 移除必须由外部或协调者提供 t0 的约束；单次流程就是选手先做、评委后做、最后手动运行汇总脚本。
- 冒烟测试同时接受 external 和 process 两种 t0 来源。
## v1.3.0 — 2026-11-04

中心化追加式 D 层评审（**与 v1.2.0 的成绩不可混排**：D 聚合口径和评审流程变化）。

### 新增

- `judge_submit.py`：评委每次提交一个 case 的评分，追加到中心日志 `leaderboard/reviews.jsonl`；不回显其他评委分数，同一评委重复提交会被拒绝。
- `review_log.py`：中心日志校验、追加锁、读取、按评委去重、mean/median 聚合。
- `review_merge.py`：主控查看/导出中心日志的聚合结果。
- `finalize.py` 新增 `--review-log`、`--d-aggregate mean|median`、`--min-judges`；支持不固定评委人数，并在排行榜显示 D 评委数。

### 变更

- `judge_pack.py` 不再生成固定 3 个评委槽位的 `verdict.draft.json`，改为生成 `pack.json` 和 `SUBMIT.md`；评委通过 `judge_submit.py` 独立提交。
- 同一模型可生成多个 `<模型>.<pack_id>.blind-map.json`；`finalize.py --model` 自动发现并合并所有 run，`summary` 记录 `runs_total` / `runs_scored` / `judge_reviews` / `rounds_total`。
- 中心日志、聚合产物和私有映射均不进入盲评包；中心日志与盲评映射已加入 `.gitignore`。
- 文档同步说明：评委不得查看中心日志或其他评委评分；主控负责最终合并。

## v1.2.0 — 2026-11-04

评分与盲评修正（**与 v1.1.0 的成绩不可混排**：C2 错误码口径、C3 文档口径、D 盲评流程变化）。

### 修复

- **C2 状态一致性**改为使用引擎实际错误码：`INVALID_ORDER`、`ORDER_NOT_CARRIED`、`ORDER_NOT_PICKED_UP`、`WRONG_LOCATION`、`NOT_AT_SWAP_STATION` 等；容量错误按独立容量类统计，不进入 C2。
- **C3 路径质量**明确只使用 `pathEfficiency = 总行驶距离 / 已完成订单取送距离之和`；`emptyRatio` 不参与评分，`docs/scoring.md` 与 `docs/design.md` 已同步。
- **D 层盲评**：`judge_pack.py` 生成匿名盲评包，只把 `leaderboard/blind/<pack_id>/` 路径交给评委；包内不出现模型名、A/B/C、运行目录或种子明文。`case_id -> run` 私有映射写到 `leaderboard/verdicts/<模型名>.blind-map.json`，不交给评委；`finalize.py` 支持 `--blind-map` 与 `case_id` 映射。
- `finalize.py` 增加 D1/D2/D3 范围校验，并在有效评委少于 3 位时提示。
- 新增 `tests/scoring_units.py`，覆盖 C2 实际错误码与 C3 只使用 `pathEfficiency`。

## v1.1.0 — 2026-11-03

赛制收紧与度量修正（**与 v1.0.0 的成绩不可混排**：供给时刻、工具数量、C3 分档都变了）。

### 变更

- **供给时刻**：新单改为在每 5 分钟**整点**生成（出生时刻 = 批次时刻），不再沿用"动作结束时刻"。
  取消 `wait` 内部的生单，改为统一由驱动按边界补发（一次时间推进跨多个边界也会按各自的边界时刻生成）。
- **工具集 14 → 13**：移除 `search_nearby_orders`（观察已给全部在库单，该工具恒冗余）；
  调用未暴露的工具返回 `TOOL_DISABLED` 并计入无效调用。
- **C3 重新分档**：路径效率阈值改为 0.75/0.90/1.05/1.20/1.45/1.80/2.40/3.50（按真实轨迹标定，
  旧阈值 1.10 会让"只要合单就满级"）。
- **D1 度量修正**：每笔接单新增 `feePerMinute = fee/(2d+3)`（与池子大小无关），
  事实卡摘要以它为 D1 主指标；费用分位降级为"会随池子漂移"的参考列。

### 新增

- `tools/verify_replay.mjs`：读 `trace.jsonl` 逐条重放、与 `result.json` 对账（不一致退出码 1）。
- `tests/smoke.ps1` 增加回放断言：冒烟跑完必须回放一致。
- `src/scoring/finalize.py`：出榜脚本——核对种子承诺、逐目录回放核验、把 A/B/C 与裁判 D 合成总分，
  写 `leaderboard/scores.md` 与 `leaderboard/verdicts/<模型>.json`（审计留档）。
- `tools/harness.mjs`：**一句话开跑**——读观察 → 调 policy → 写一行调用；执行者只需写一个 policy 文件。
- `examples/policy-greedy.mjs`：示例策略（贪心选单 + 低电换电），可直接改用。
- `src/scoring/judge_pack.py`：裁判素材包（打印事实卡 + 生成待填草稿），配合 `finalize --d-file`。
- **固定种子**：`configs/seeds.commit.json` 公开承诺；明文 `configs/seeds.json` 不进库、由主控保管。
  起局/评分/出榜均可用 `--seed-index` / `--seed-indexes` 按序号取，执行者无需接触明文。
- 工具返回数据新增 **`[result]`** 行（此前查询结果、移动耗时、结算金额都被吞掉）；
  在途单字段与在库单对齐（`pickup`/`delivery`，保留 `pickupLocation`/`deliveryLocation` 兼容）。

### 规则

- 明确写入"**禁止推演**"：不得反推种子、重现订单流或预知未来订单；核验发现按 D 层 0 分或取消成绩。

## v1.0.0 — 2026-11-03

首个版本：赛制、驱动、计分与工具链。

### 赛制

- 480 分钟班次（06:00–14:00），时钟 840 封顶，400 轮上限。
- 新单按**模拟时间**到达：每 5 分钟 1–3 张；查询不推进时间。
- 时限自**接单**起算；承载 5 单 / 10 kg；电量 2%/km，换电 1 分钟 + 0.5 元。
- 允许写脚本代打，代价是端到端时间；`--clock-cap reject` 可拒绝越线动作。

### 计分

- A30 净利 / 锚（默认 350）；B15 = 无效调用 5 + **端到端**耗时 10；C25 = 约束 9 + 状态 8 + 路径 8；D30 = 事实卡 × 3 评审取中位。
- `t0_source` 标记计时起点来源；`process`（自己按的开始键）会让 `b2_reliable=false`。

### 工程

- `src/`：引擎（只读）、驱动、评分（指标 / 入口 / 汇总）。
- `configs/benchmark.json`：场景、供给、时钟、轮数、评分常量的单一配置源。
- `tools/`：种子预注册（`gen_seeds.mjs`）、物理界与锚值标定（`bounds.mjs`）。
- `scripts/`：起一班、评分、按种子批量评分。
- `tests/smoke.ps1`：端到端自检（跑一班 → 断言产物 → 评分 → 校验种子承诺）。
- 补回引擎缺失的 `src/engine/client/system-prompt.js`：`help` 工具此前调用必失败（还会被计为无效调用），现已返回规则、工具清单与当前状态。
- 过期单在**每次时间推进后立即清理**（不再只在生单时清理）：观察里不会再出现"已过期但仍在库"的单。
- 在库单观察新增 **`expiresIn`**（还能在库里待几分钟）：让"先跑过去再接单"的代价可见、可判断。

### 已知限制

见 `docs/design.md` §7。

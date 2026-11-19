# CHANGELOG

## v1.5 — 2026-11-12

评分平滑 + 行驶速度 ×2（**与 v1.4 及更早成绩不可混排**：B/C 计分、B 封顶、行驶速度、时限、锚值都变了；旧种子已被 v1.4 的 5 个模型用过，新批次需重新生成种子）。

- **盲评与汇总出榜管线升级（2026-11-19，计分公式与锚值不变）**：
  - **客观分与盲评分物理分离、独立校验**：选手阶段严禁运行 `score_run.py` 或生成/篡改官方得分；`judge_pack.py` 改为直接从冻结交付物提取纯脱敏事实卡，不再调用 `score_run.py` 生成 `评分.json`；`score_run.py` 移除直接追加 `scores.md` 及 `D_judged` 占位字段，总榜仅由 `finalize.py` 唯一合成。
  - **客观评分双指纹防篡改缓存**（新增 `src/scoring/objective_cache.py`）：官方客观评分完成种子核验与原引擎回放核验定稿后，在 `评分.json` 中记录评分配置与评分/回放脚本整体哈希（`scoring_hash`）、单局冻结交付物快照哈希（`deliverables_hash`）及绑定种子的防伪摘要（`attestation`）。`finalize.py` 汇总时先核对指纹与摘要，均未变化时直接复用已定稿客观分，仅对新增或变动局重跑客观评测与回放探针；新增 `--recompute`（别名 `--force-recompute`）开关支持强制全量重算。
  - **盲评随时重评且实时生效**：盲评结果绝不缓存；`judge_submit.py` 默认允许同一评委（相同 `--judge-id`）随时追加重评记录，`review_log.dedupe_latest` 按精确时间戳与追加顺序取最新一条；每次执行 `finalize.py`（含全量与单模型 `--model` 模式）均实时重读最新盲评日志重新合成总分，保留同一模型每一局详细明细，并按多局算术平均数实时重排刷新总榜。新增 `ObjectiveCacheAndFinalizePipelineTests` 全链路测试。

- **行驶速度 ×2**（新增 `src/client/movement_tuning.mjs`，`configs/benchmark.json → movement.speed_multiplier`，当前 2）：不改 `src/engine/`，运行时包装 `CongestionManager.congestionToSpeed`，move_to / estimate_time / 越线预判同步变快；`search_nearby_battery_stations` 的 estimatedTime 在引擎里写死，由客户端同比例换算；`help` 文本（`src/engine/client/system-prompt.js`，唯一允许改的引擎侧文件，仅文本）按 `sim.rulesInfo` 显示实际速度与时限公式。推行速度、取货 / 送货 / 换电耗时、电耗不变。`protocol.json` 新增 `movement`，`verify_replay.mjs` 按它重放（缺省 = 1，兼容旧运行）。目的：每局完成单数由约 16 提高到 20+，降低结果的离散噪声。
- **观察与事实卡口径补齐**：06:00–07:00 早间 +1 元补贴同步显示在骑手实时观察的待接订单与在途订单中，并计入事实卡接单费用统计；事实卡“单位时间收入”随车速倍率动态换算（2 倍速下由 `fee/(2d+3)` 更新为 `fee/(d+3)`）；事实卡超时滞留统计补算交货动作的 1 分钟耗时，与引擎结算对齐；选手说明补充职业履约要求并明令禁止选手翻阅评分细则与底层代码。
- **上限工具与模型归并修正**：`tools/bounds.mjs` 的现实路由界 1.5km 接驾耗时按车速倍率动态换算，并计入 06:00–07:00 早间 +1 元补贴；`model_identity` 统一按小写归一化规范模型 ID，避免 Windows 下同模型不同大小写拆行或覆盖裁决文件。
- **配套时限**：`distribution.timeLimit` 开启，`scale 0.5`（= 1 / 速度倍率）、`minMinutes 12`。timeLimit 同时决定在库单的消失时间，所以订单在库里的寿命也同比缩短。
- **锚值标定为 600 & 脚本代打阈值收紧至 50ms**：首批实测后用修正版 `tools/bounds.mjs` 复核三个种子（现实路由界 ×0.71 分别为 610 / 589 / 615，均值 ≈605，实测最高净利 495.5），锚值由暂定 700 正式标定为 **600**；同时考虑轻量快速模型与多工具连发时的正常间隔（约 150–300ms），将疑似脚本代打的中位调用间隔阈值移入配置 `scoring.suspect_script_ms` 并由 300ms 调整为 **50ms**。`finalize.py` 同步让分模型成绩明细按总分排名排序，并将耗时表头明确为“耗时(分钟)”。
- **版本号** `xiaonuo-v1.4` → `xiaonuo-v1.5`，README / protocol / scoring / design 同步。
- **旧榜单归档**：v1.4 及更早的 `scores.md`、`verdicts/*.json`、12 个盲评包、7 个私有映射、`reviews.jsonl` 整体移到 `leaderboard/归档v2/`（与 `runs/归档v2/` 对应，附 README）；`leaderboard/scores.md` 重写为 v1.5 榜头、暂无成绩；`.gitignore` 同步忽略归档里的盲评包 / 映射 / 评审日志。`leaderboard/finalize.py` 的自动发现只看 `leaderboard/blind-maps/`，不会再读到旧批次。
- 参考实测（开发用贪心策略，非正式成绩）：三个种子完成单数 11/9/11 → 22/21/22，轮数约 70 → 145；三局回放核验均一致。

- **B1 / B2 对 A 的封顶放松**（`src/scoring/metrics.py`，同样需在发版时升版本号）：由“`B ≤ 满分 × A/30`”改为“`B ≤ 满分 × min(1, A/(30×cap_a_ratio))`”，`cap_a_ratio` 默认 0.5（`configs/benchmark.json → scoring.B`），即 A≥15 后不再封顶。原因：旧封顶线在 15 行成绩里让 10 行 B1 恰好等于 A/6、让“快但弱”的 B2 等于 A/3，B 层成了 A 的复制品。`B_detail.cap31` 改名 `cap_frac`。新增 `BCapTests`。
- **B1 / C1 / C2 / C3 台阶改连续**（`src/scoring/metrics.py`，**改完与旧批次分数不可混排，发版时需升版本号**）：沿用原档位的节点，节点之间线性插值，得到 0–10 的“等效级”。原因：一局只有约 15 单、约 120 次调用，旧档位让一次失误就掉 0.5–0.9 分，噪声被档位放大。变化：① 0 失误 / 满准时现在能拿到 10 级（原最高 9 级，好局普遍 +10%）；② C2 只看状态错误次数，不再看占调用的比率；③ C1 罚款按金额连续扣级（15 元 = 原来的 −1 级，最多 −2）；④ `评分.json` 的 `C_levels` 现在是等效级（保留两位小数）。C3 仍用总里程比，“每单绕路均值”的重定义尚未做。新增 `tests/scoring_units.py` 的连续性 / 单调性 / 节点测试。
- `tools/bounds.mjs` 修正：此前直接用裸引擎生成供给，**没套 v1.4 的午高峰 + 空间聚簇**，算出来的界和实际玩的供给不一致。现在改走与 `rider_client` / `verify_replay` 相同的 `createDistribution` + `spawnBatch`；新增 `--seed-index`（脚本读 `$SR_SEEDS`，输出不带种子明文）、`--protocol`（用该局生效的 distribution 配置）、`--json`（单行输出，引擎的过期清理日志已静音）。对三个已用种子重算：C 现实界 563.9 / 525.7 / 548.2，按文档 ×0.71 得 400 / 373 / 389，低于现行锚值 500；锚值是否调整另议。

- 榜单明细拆分：`finalize.py` 的大榜与各模型成绩表把 B/C/D 拆为明细列（B1 无效 5 / B2 耗时 10；C1 约束 9 / C2 状态 8 / C3 路径 8；D1 挑单 11 / D2 组合 10 / D3 风险 9；A 不拆分），原"端到端均值(分)"列更名为"耗时"（端到端墙钟，分钟，非分数）；`verdicts/<模型>.json` 的 `mean` / `range_half` 同步携带明细（D1/D2/D3 来自评审日志聚合，direct 直给 D 时明细为空）。
- 评分收口到汇总侧：`finalize.py` 出榜时对每个 run 统一调用 `score_run.py --seed <种子> --no-record` 重算 A/B/C 与事实卡（不再要求选手预先跑评分）；`judge_pack.py` 对缺 factcard 的 run 自动补算。大榜新增"端到端均值(分)"列（取 verdicts 中各 run 的现实耗时均值）。
- 出榜流程简化：`finalize.py` 的 `--model` 改为可选，不填时自动发现 blind-maps 中所有模型逐个出榜，并覆盖式重新生成 `scores.md`（保留榜头、清空历史成绩段）；新增入口脚本 `leaderboard/finalize.py`（默认带 `--review-log`，其余参数原样转发），一条命令全量出榜到 `leaderboard/`。`scores.md` 顶部新增"大榜"（按各模型总分均值排名，展示 A/B/C/D 与净利均值），各模型成绩表末尾新增"平均"行。

- 文档口径统一：代打规则统一为"禁止脚本代打、只允许逐轮手动玩"（`docs/design.md`、`leaderboard/scores.md` 旧表述已修正）；`scores.md` 榜头去掉版本号标注、锚值更正为 500、记录与榜单生成方式改为"评委评价后追加中心日志 + `finalize.py` 手动生成榜单"。
- 选手手册删除策略提示：移除"打法提示"整节，以及六条规则中的策略引导（"先到点再接单"技巧、"超市/药店单最肥"），只保留规则机制；选单、合单、换电、收班策略由模型自行发现。
- 新增目录写入纪律：选手/评委不得随意在仓库写文件，临时辅助文件只能写 `draft/` 且用完必须删除；`.gitignore` 已收录 `draft/`。清理根目录遗留调试残留（`adj.txt`、`adj2.txt`、`locs.txt`、`map_s2_raw.json`）。
- 新增 token 消耗自报要求：每局结束后由选手写入 `runs/<名>/token_usage.json`（`source=self_report`），只作成本诊断，不参与评分。

- 目录整理：最终裁决 JSON 保留在 `leaderboard/verdicts/`，盲评私有映射统一迁移到 `leaderboard/blind-maps/`；`judge_pack.py` 与 `finalize.py` 的默认发现路径同步，旧的归档批次映射已清理。

- distribution.timeLimit（默认 enabled: false）：可选收紧新单与初始在库单的 timeLimit，支持 scale / cutMinutes / minMinutes，回放共用。
- tools/timing_audit.py：检测同模型多局时间重叠，提示 B2 墙钟不可比；支持 --json 输出与 --strict 出榜拦截。
- 文档明确：三局并发只对引擎状态安全，B2 要求同模型三局串行；文档版本同步到 v1.4。

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

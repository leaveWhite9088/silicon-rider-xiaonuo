# 与上游的关系（重要）

本仓库**不是** [KCORES/silicon-rider-bench](https://github.com/KCORES/silicon-rider-bench) 的分支，
而是“用它的引擎 + 我们自己的赛制/驱动/评分”的**衍生基准**。

## 上游与版本（已锁定）

- 仓库：`https://github.com/KCORES/silicon-rider-bench`　许可：MIT
- **上游版本固定为 `0336607544851e542cf612c1df1a6f4fd7bbf173`**
  （见题目资料 `资料/说明.md`；2026-11-03 核对 GitHub `main` 的树 sha 与之一致）。
- 本机完整源码副本（**题目资料自带，不在本仓库**）：
  `private-llm-benchmark/题目/04-复杂Agent工作/资料/vendor/silicon-rider-bench`
  - 含完整 TypeScript 源码（`src/`，约 18,200 行）与编译产物（`dist/`）、测试、CLI、Web 可视化。
  - 拷贝时**去掉了 `.git`**，因此无法 `git log`；版本以 `资料/说明.md` 的锁定值为准。
  - 该副本保留原作者文件与 MIT 声明，并含**上游之外的本地复现补丁**（计时与随机种子等）。

## 我们用的是哪一份代码

- `src/engine/**` = 上述 `vendor/silicon-rider-bench/dist/**` 的**逐字节拷贝**。
  已用 SHA256 抽查 `core/simulator.js`、`core/game-clock.js`、`tools/action-tools.js`、`world/map-generator.js`，四个全部一致。
- 引擎树上唯一**新增**：`src/engine/client/system-prompt.js`（`help` 工具依赖它）。
  上游原文是 `src/client/system-prompt.ts`（23,602 字节），我们的是约 3.5 KB 的重写版
  → **`help` 返回的规则文本不是上游原文**。
- 引擎逻辑未改；但它是编译产物，不含源码，改动上游修复仍需回到 `vendor/src` 重新编译。

## 已经不是同一件事的地方（**分数不可与上游比较**）

| 维度 | 上游 | 本仓库 |
| --- | --- | --- |
| 班次长度 | Level 1 = 1440 分钟 | **480 分钟**（06:00–14:00） |
| 地图 | Level 1「50+ 节点」 | 100 节点（`mapSize: large`） |
| 新单供给 | 按模型轮次（runner 驱动） | **按模拟时间**（每 5 分钟一批） |
| 工具 | 10 个（含 V2 小票取餐、V3 多骑手） | **13 个**（V1，不含小票） |
| 评分 | 利润 / 准时率 / 路径效率 / 违规率 | **A30 + B15 + C25 + D30**（事实卡评审） |
| 交互 | CLI / Web 可视化 / runner 调 API | 行式会话 + `session` / `harness` 桥 |

## 维护策略（二选一）

- **冻结自立**（当前）：不再跟上游；自行修复与演进，保留 `NOTICE.md` 的署名与 MIT 声明。
- **回接上游源码**：源码就在 `vendor/src`，可直接取用；把我们的补丁
  （时间驱动供给、端到端计时、种子承诺、评分层）叠上去，并重跑 `资料/说明.md` 记录的本地补丁。
  可长期合并上游修复，成本较高。

## 发布口径

- 引用时写“**基于 KCORES Silicon Rider Bench（`0336607…`）引擎的衍生基准 `xiaonuo-v1.1`**”，
  不要写成“上游的第 X 版”。
- 分数只在本文档的口径内可比；跨版本、跨上游都不可比。

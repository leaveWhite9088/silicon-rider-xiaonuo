# -*- coding: utf-8 -*-
"""对一次运行目录计算 A/B/C（脚本层），生成决策事实卡，并追加到排行榜。

用法：
    python src/scoring/score_run.py runs/<名> <模型名> [--seed 12345] [--anchor 350] [--no-record]

--seed      可选：用明文种子核对 protocol.json 里的 sha256 承诺；不匹配会显式报警（防事后换种子）
--anchor    可选：覆盖 A 的分母（缺省读 configs/benchmark.json → scoring.anchor_yuan）
--no-record 只写 factcard/评分.json，不追加排行榜（CI/冒烟用）
"""
from pathlib import Path
import sys, json, hashlib, argparse, datetime

try:                                    # Windows 控制台默认 GBK，避免打印中文/符号时崩
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent          # src/scoring
ROOT = HERE.parent.parent                       # 仓库根
sys.path.insert(0, str(HERE))
import metrics

ap = argparse.ArgumentParser()
ap.add_argument("folder")
ap.add_argument("model")
ap.add_argument("--seed", type=int, default=None)
ap.add_argument("--anchor", type=float, default=None)
ap.add_argument("--no-record", action="store_true")
a = ap.parse_args()

folder = Path(a.folder).resolve()
if not folder.exists():
    print("运行目录不存在:", folder)
    sys.exit(1)
if a.anchor is not None:
    metrics.PROFIT_ANCHOR = float(a.anchor)

proto = json.loads((folder / "protocol.json").read_text(encoding="utf-8"))
commit = (proto.get("scene") or {}).get("seed_commit")
seed_ok = None
if a.seed is not None:
    calc = hashlib.sha256(("sr:" + str(a.seed)).encode()).hexdigest()
    seed_ok = (calc == commit)
    if not seed_ok:
        print(f"!! 种子承诺不匹配：给定 {a.seed} 的哈希 {calc[:12]}… ≠ 记录 {str(commit)[:12]}…（该次成绩应作废）")

m = metrics.analyze_work(folder)
s = metrics.score_work(m)
(folder / "factcard.md").write_text(metrics.factcard(a.model, a.model, m), encoding="utf-8")
out = dict(s)
out["seed_commit"] = commit
out["seed_verified"] = seed_ok
out["anchor"] = metrics.PROFIT_ANCHOR
out["t0_source"] = m.get("t0Source")
out["b2_reliable"] = (m.get("t0Source") != "process")
(folder / "评分.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
if m.get("t0Source") == "process":
    print("!! t0 来自裁判域之外（驱动自己按的开始键）：B2 不可信，该次成绩应标注或重跑")

e2e = (m.get("endToEndSeconds") or 0) / 60
drv = (m.get("wallSeconds") or 0) / 60
rec = (
    f"\n## {a.model} — {datetime.datetime.now():%Y-%m-%d %H:%M}\n"
    f"- 运行目录：`{folder}`\n"
    f"- 净利：{m['profit']:.2f} / {metrics.PROFIT_ANCHOR:.0f} 元锚　完成 {m.get('completed')} 单"
    f"（准时率 {None if m.get('onTimeRate') is None else round(m['onTimeRate'],3)}），终止 {m.get('termination')}\n"
    f"- 计时：端到端 **{e2e:.1f} 分钟**（B2 口径）/ 驱动 {drv:.1f} 分钟；新单生成 {m.get('arrivalMode')}（{m.get('arrivalBatches')} 批）\n"
    f"- 种子承诺：`{str(commit)[:16]}…`" + ("" if seed_ok is None else ("　[已验证]" if seed_ok else "　[不匹配，成绩作废]")) + "\n"
    f"- **A 任务成果 = {s['A_outcome']:.2f} / 30**\n"
    f"- **B 执行效率 = {s['B_efficiency']:.2f} / 15**（无效调用率 {None if m.get('invalid_ratio') is None else round(m['invalid_ratio']*100,2)}% → B1={s['B_detail']['B1_invalid5']}；耗时 B2={s['B_detail']['B2_time10']}）\n"
    f"- **C 操作质量 = {s['C_quality']:.2f} / 25**（C1={s['C_levels']['C1']} 级、C2={s['C_levels']['C2']} 级、C3={s['C_levels']['C3']} 级）\n"
    f"- D 决策智能 = 待评审（事实卡：`{folder / 'factcard.md'}`）\n"
    f"- 脚本层小计 = **{s['total_v2_partial']:.2f} / 70**"
    + ("　⚠️ A 打穿锚值，触发人工复核" if s.get("A_out_of_range") else "")
    + "\n"
)
if not a.no_record:
    record = ROOT / "leaderboard" / "scores.md"
    record.parent.mkdir(parents=True, exist_ok=True)
    with record.open("a", encoding="utf-8") as f:
        f.write(rec)
    print(rec)
print(f"评分完成：A={s['A_outcome']} B={s['B_efficiency']} C={s['C_quality']} 小计={s['total_v2_partial']}"
      + ("" if a.no_record else "（已追加到 leaderboard/scores.md）"))
print(f"调用节奏中位间隔 {m.get('medianCallGapMs')} ms"
      + ("（疑似脚本代打）" if m.get("suspectScript") else "") + f"；越线={m.get('overrun')}")

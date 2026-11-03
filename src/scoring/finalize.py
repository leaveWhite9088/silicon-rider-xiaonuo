# -*- coding: utf-8 -*-
"""汇总：把 N 个种子的脚本分（A/B/C）与裁判 D 分合成最终成绩，写入排行榜。

用法：
    python src/scoring/finalize.py --model GLM-5.3 \
        --runs runs/GLM-5.3-s1 runs/GLM-5.3-s2 runs/GLM-5.3-s3 \
        --seeds 111,222,333 --d 21,22.5,23 [--no-replay] [--dry-run]

流程：
  1) 核对每个种子的承诺（sha256("sr:"+seed) == protocol.scene.seed_commit）
  2) 对每个运行目录跑回放核验（tools/verify_replay.mjs），不一致直接拒绝入榜
  3) 读取 评分.json（A/B/C）+ 传入的 D（每个种子一个 D，已是 3 位裁判的中位）
  4) 每个种子算总分 = A+B+C+D；再取 均值 ± 极差
  5) 写 leaderboard/verdicts/<model>.json（审计留档）并追加 leaderboard/scores.md
"""
from pathlib import Path
import sys, json, hashlib, argparse, datetime, statistics, subprocess

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
LEADERBOARD = ROOT / "leaderboard" / "scores.md"
VERDICTS = ROOT / "leaderboard" / "verdicts"

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--runs", nargs="+", required=True)
ap.add_argument("--seeds", required=True, help="逗号分隔，与 --runs 一一对应")
ap.add_argument("--d", required=True, help="逗号分隔的 D 分（每个种子一个，已是 3 位裁判的中位）")
ap.add_argument("--no-replay", action="store_true", help="跳过回放核验（不建议；仅调试用）")
ap.add_argument("--dry-run", action="store_true", help="只打印，不写榜单/裁决文件")
a = ap.parse_args()

runs = [Path(p).resolve() for p in a.runs]
try:
    seeds = [int(x) for x in a.seeds.split(",")]
except ValueError:
    print("--seeds 必须是逗号分隔的整数"); sys.exit(1)
try:
    ds = [float(x) for x in a.d.split(",")]
except ValueError:
    print("--d 必须是逗号分隔的数字"); sys.exit(1)
if not (len(runs) == len(seeds) == len(ds)):
    print(f"--runs / --seeds / --d 数量必须一致（现在 {len(runs)}/{len(seeds)}/{len(ds)}）"); sys.exit(1)

rows, errors = [], []
for run, seed, d in zip(runs, seeds, ds):
    name = run.name
    for f in ("protocol.json", "result.json", "评分.json"):
        if not (run / f).exists():
            errors.append(f"{name}: 缺少 {f}（先跑 score_run.py）"); break
    if errors: continue
    proto = json.loads((run / "protocol.json").read_text(encoding="utf-8"))
    res = json.loads((run / "result.json").read_text(encoding="utf-8"))
    sc = json.loads((run / "评分.json").read_text(encoding="utf-8"))

    commit = (proto.get("scene") or {}).get("seed_commit")
    calc = hashlib.sha256(("sr:" + str(seed)).encode()).hexdigest()
    if calc != commit:
        errors.append(f"{name}: 种子承诺不匹配（给定 {seed}）")
        continue

    replay_ok = None
    if not a.no_replay:
        r = subprocess.run([("node"), str(ROOT / "tools" / "verify_replay.mjs"), str(run), "--seed", str(seed)],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        replay_ok = (r.returncode == 0)
        if not replay_ok:
            errors.append(f"{name}: 回放与结算不一致（成绩应作废）")
            continue

    A, B, C = sc.get("A_outcome"), sc.get("B_efficiency"), sc.get("C_quality")
    total = round((A or 0) + (B or 0) + (C or 0) + d, 2)
    rows.append({
        "run": name, "seed_commit": commit[:12], "seed_verified": True, "replay_ok": replay_ok,
        "profit": round(float((res.get("score") or {}).get("totalProfit") or 0), 2),
        "completed": (res.get("score") or {}).get("completedOrders"),
        "endToEndMin": round(float(res.get("endToEndSeconds") or 0) / 60, 1),
        "A": A, "B": B, "C": C, "D": d, "total": total,
        "t0_source": (res.get("score") and None) or (proto.get("timing") or {}).get("t0_source"),
    })

if errors:
    print("不能出榜：")
    for e in errors: print("  !! " + e)
    sys.exit(1)

def agg(key):
    vals = [r[key] for r in rows if isinstance(r[key], (int, float))]
    return (statistics.mean(vals), (max(vals) - min(vals)) / 2) if vals else (None, None)

lines = []
lines.append(f"\n### 最终成绩 · {a.model} — {datetime.datetime.now():%Y-%m-%d %H:%M}")
lines.append("")
lines.append("| 种子 | 净利 | 单数 | 端到端 | A(30) | B(15) | C(25) | D(30) | 总分(100) | 承诺 | 回放 |")
lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for r in rows:
    lines.append(f"| {r['seed_commit']} | {r['profit']:.1f} | {r['completed']} | {r['endToEndMin']:.1f} 分 "
                 f"| {r['A']:.2f} | {r['B']:.2f} | {r['C']:.2f} | {r['D']:.2f} | {r['total']:.2f} "
                 f"| {'✓' if r['seed_verified'] else '✗'} | {'✓' if r['replay_ok'] in (True, None) else '✗'} |")
meanA, rngA = agg("A"); meanB, rngB = agg("B"); meanC, rngC = agg("C")
meanD, rngD = agg("D"); meanT, rngT = agg("total"); meanP, rngP = agg("profit")
lines.append("")
lines.append(f"**均值 ± 极差**：净利 {meanP:.1f} ±{rngP:.1f}｜A {meanA:.2f} ±{rngA:.2f}｜B {meanB:.2f} ±{rngB:.2f}"
             f"｜C {meanC:.2f} ±{rngC:.2f}｜D {meanD:.2f} ±{rngD:.2f}｜**总分 {meanT:.2f} ±{rngT:.2f}**")
lines.append("")
lines.append(f"- 口径：`{(json.loads((runs[0] / 'protocol.json').read_text(encoding='utf-8')) or {}).get('version')}`；"
             f"种子数 {len(rows)}；脚本层 A/B/C 由 `src/scoring/score_run.py` 计算，D 由裁判独立给出（每张事实卡 3 位取中位）。")
text = "\n".join(lines)

print(text)
if a.dry_run:
    print("\n[dry-run] 未写入榜单与裁决文件。")
    sys.exit(0)

VERDICTS.mkdir(parents=True, exist_ok=True)
(VERDICTS / f"{a.model}.json").write_text(json.dumps({
    "model": a.model, "finalized_at": datetime.datetime.now().isoformat(timespec="seconds"),
    "runs": rows,
    "mean": {"profit": meanP, "A": meanA, "B": meanB, "C": meanC, "D": meanD, "total": meanT},
    "range_half": {"profit": rngP, "A": rngA, "B": rngB, "C": rngC, "D": rngD, "total": rngT},
}, ensure_ascii=False, indent=1), encoding="utf-8")
with LEADERBOARD.open("a", encoding="utf-8") as f:
    f.write(text + "\n")
print(f"\n已写入：{LEADERBOARD.relative_to(ROOT)} 与 {VERDICTS.relative_to(ROOT)}/{a.model}.json")

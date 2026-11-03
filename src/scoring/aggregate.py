# -*- coding: utf-8 -*-
"""把 N 次运行（通常 3 个种子）合成“均值 ± 极差”。

用法：
    python src/scoring/aggregate.py runs/Demo-s1 runs/Demo-s2 runs/Demo-s3
    python src/scoring/aggregate.py --prefix runs/Demo
"""
from pathlib import Path
import sys, json, argparse

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

ap = argparse.ArgumentParser()
ap.add_argument("dirs", nargs="*")
ap.add_argument("--prefix", default=None)
a = ap.parse_args()

dirs = [Path(d).resolve() for d in a.dirs]
if a.prefix:
    p = Path(a.prefix).resolve()
    dirs += sorted(x for x in p.parent.glob(p.name + "*") if x.is_dir())
dirs = [d for d in dirs if (d / "评分.json").exists()]
if not dirs:
    print("没有带 评分.json 的运行目录（先跑 score_run.py）")
    sys.exit(1)

rows = []
for d in dirs:
    s = json.loads((d / "评分.json").read_text(encoding="utf-8"))
    r = json.loads((d / "result.json").read_text(encoding="utf-8"))
    rows.append({
        "run": d.name,
        "profit": (r.get("score") or {}).get("totalProfit"),
        "A": s.get("A_outcome"), "B": s.get("B_efficiency"), "C": s.get("C_quality"),
        "total": s.get("total_v2_partial"),
        "e2e_min": round((r.get("endToEndSeconds") or 0) / 60, 1),
        "rounds": r.get("rounds"),
        "seed_verified": s.get("seed_verified"),
        "commit": str(s.get("seed_commit"))[:12],
    })

def stat(key):
    vals = [x[key] for x in rows if isinstance(x[key], (int, float))]
    return (sum(vals) / len(vals), max(vals) - min(vals)) if vals else None

print(f"{'run':<26}{'净利':>9}{'A':>7}{'B':>7}{'C':>7}{'小计':>7}{'端到端':>8}{'轮数':>6}  种子")
for x in rows:
    print(f"{x['run']:<26}{x['profit'] or 0:>9.1f}{x['A'] or 0:>7.2f}{x['B'] or 0:>7.2f}{x['C'] or 0:>7.2f}"
          f"{x['total'] or 0:>7.2f}{x['e2e_min']:>8.1f}{x['rounds'] or 0:>6}  {x['commit']}")
print("-" * 84)
for k, label in (("profit", "净利"), ("A", "A"), ("B", "B"), ("C", "C"), ("total", "小计")):
    st = stat(k)
    if st:
        print(f"{label:>6}：均值 {st[0]:.2f}　极差 ±{st[1] / 2:.2f}（max−min={st[1]:.2f}）")

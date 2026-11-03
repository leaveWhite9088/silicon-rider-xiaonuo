# -*- coding: utf-8 -*-
"""裁判素材包：把某模型各次运行的决策事实卡集中打印，并生成待填的裁决草稿。

用法：
    python src/scoring/judge_pack.py --model Demo [--runs runs/Demo-s1 runs/Demo-s2 runs/Demo-s3]

产物：
    leaderboard/verdicts/Demo.draft.json   —— 裁判填 D1/D2/D3（可填多组，代表多位裁判）
"""
from pathlib import Path
import sys, json, argparse

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
VERDICTS = ROOT / "leaderboard" / "verdicts"

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--runs", nargs="*", default=None)
ap.add_argument("--print", dest="do_print", action="store_true", help="打印完整事实卡（供裁判阅读）")
a = ap.parse_args()

runs = [Path(p).resolve() for p in a.runs] if a.runs else sorted(
    p for p in (ROOT / "runs").glob(a.model + "*") if p.is_dir())
runs = [r for r in runs if (r / "factcard.md").exists()]
if not runs:
    print("没有找到带 factcard.md 的运行目录（先跑 score_run.py）")
    sys.exit(1)

VERDICTS.mkdir(parents=True, exist_ok=True)
draft = {"model": a.model, "seeds": [
    {"run": r.name, "judges": [{"D1": None, "D2": None, "D3": None, "note": ""}]} for r in runs
]}
out = VERDICTS / f"{a.model}.draft.json"
out.write_text(json.dumps(draft, ensure_ascii=False, indent=1), encoding="utf-8")

print(f"裁判素材包 · {a.model}　共 {len(runs)} 次运行\n")
for r in runs:
    sc = json.loads((r / "评分.json").read_text(encoding="utf-8")) if (r / "评分.json").exists() else {}
    print(f"=" * 78)
    print(f"运行目录：{r.name}　脚本层 A={sc.get('A_outcome')} B={sc.get('B_efficiency')} C={sc.get('C_quality')}")
    print(f"请只依据下面的事实卡打分（不要看净利）：{r / 'factcard.md'}")
    print(f"=" * 78)
    if a.do_print:
        print((r / "factcard.md").read_text(encoding="utf-8"))
    else:
        head = (r / "factcard.md").read_text(encoding="utf-8").splitlines()
        print("\n".join(head[:12]) + "\n  …（完整内容用 --print 查看）\n")

print(f"\n已生成草稿：{out}")
print("请把每个种子的 D1/D2/D3 填进草稿（每位裁判一组；单裁判就填一组），然后运行：")
print(f"  python src/scoring/finalize.py --model {a.model} --runs "
      + " ".join(str(r) for r in runs)
      + f" --seeds <s1,s2,s3> --d-file {out}")

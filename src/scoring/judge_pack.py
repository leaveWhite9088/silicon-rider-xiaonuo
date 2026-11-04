# -*- coding: utf-8 -*-
"""
生成匿名盲评包。评委只拿到 leaderboard/blind/<pack_id>/ 这一个目录路径；
包内不出现模型名、A/B/C、运行目录或种子明文。
模型到 case_id 的私有映射写到 leaderboard/verdicts/<model>.blind-map.json。
"""
from pathlib import Path
import sys, json, argparse, secrets, datetime

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
VERDICTS = ROOT / "leaderboard" / "verdicts"
BLIND_ROOT = ROOT / "leaderboard" / "blind"

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--runs", nargs="*", default=None)
ap.add_argument("--judges", type=int, default=3, help="每个 case 预留的独立评委槽位")
ap.add_argument("--print", dest="do_print", action="store_true", help="兼容旧参数：只打印盲评包内路径，不打印事实卡内容")
a = ap.parse_args()

if a.judges < 1:
    print("--judges 必须 >= 1")
    sys.exit(1)

runs = [Path(p).resolve() for p in a.runs] if a.runs else sorted(
    p for p in (ROOT / "runs").glob(a.model + "*") if p.is_dir())
runs = [r for r in runs if (r / "factcard.md").exists()]
if not runs:
    print("没有找到带 factcard.md 的运行目录（先跑 score_run.py）")
    sys.exit(1)

BLIND_ROOT.mkdir(parents=True, exist_ok=True)
pack_id = secrets.token_hex(6)
pack_dir = BLIND_ROOT / pack_id
pack_dir.mkdir(parents=True, exist_ok=False)
README = """# 匿名盲评包

本目录是评委的全部可见输入。请只阅读本目录内的 RUBRIC.md 和 case-*.md。
禁止访问仓库、runs/、leaderboard/ 或其他目录，禁止猜测模型名或 A/B/C。
评分表是 verdict.draft.json，每位评委独立填写自己的 judges 槽位。
"""
(pack_dir / "README.md").write_text(README, encoding="utf-8")
RUBRIC = """# D 层评分锚点

## D1 挑单与收益取舍（0–11）
看接单费用、单位距离费用、单位时间收入、在库池上下文、接单时机和拒单/等待是否合理。

## D2 组合同送与动态调整（0–10）
看取送点组合、携带数、多单同送、顺路程度，以及遇到新单、拥堵、电量变化时是否调整。

## D3 风险权衡与班次管理（0–9）
看时限余量、电量、换电时机、死单、滞留、收班在途和班末决策。

## 输出要求
每格至少引用 2 条事实卡证据；写最强反证；按绝对锚点评分；3 位评委独立填写。
"""
(pack_dir / "RUBRIC.md").write_text(RUBRIC, encoding="utf-8")
cases = []
mapping_cases = {}
for i, r in enumerate(runs, 1):
    case_id = f"case-{i:02d}"
    text = (r / "factcard.md").read_text(encoding="utf-8")
    text = text.replace(a.model, "匿名模型").replace(r.name, "匿名运行")
    lines = text.splitlines()
    if lines and lines[0].startswith("# "):
        lines = lines[1:]
    body = "\n".join(lines).lstrip()
    card = f"# 决策事实卡 {case_id}\n\n{body}\n"
    (pack_dir / f"{case_id}.md").write_text(card, encoding="utf-8")
    cases.append({
        "case_id": case_id,
        "factcard": f"{case_id}.md",
        "judges": [{"D1": None, "D2": None, "D3": None, "evidence": "", "note": ""}
                   for _ in range(a.judges)],
    })
    mapping_cases[case_id] = {"run": r.name}
draft = {"pack_id": pack_id, "blind": True, "rubric": "RUBRIC.md", "cases": cases}
draft_path = pack_dir / "verdict.draft.json"
draft_path.write_text(json.dumps(draft, ensure_ascii=False, indent=1), encoding="utf-8")

VERDICTS.mkdir(parents=True, exist_ok=True)
map_path = VERDICTS / f"{a.model}.blind-map.json"
map_obj = {
    "model": a.model,
    "pack_id": pack_id,
    "created": datetime.datetime.now().isoformat(timespec="seconds"),
    "cases": mapping_cases,
}
map_path.write_text(json.dumps(map_obj, ensure_ascii=False, indent=1), encoding="utf-8")

print(f"盲评包已生成：{pack_dir}")
print("把上面这个目录交给评委；不要给仓库其他路径、模型名、A/B/C 或映射文件。")
print(f"评分表：{draft_path}")
print(f"私有映射（裁判不可见，finalize.py 使用）：{map_path}")
if a.do_print:
    for c in cases:
        print(pack_dir / c["factcard"])
print("\n评委填写 verdict.draft.json 后，由主控运行 finalize.py，并用 --blind-map 指定私有映射。")

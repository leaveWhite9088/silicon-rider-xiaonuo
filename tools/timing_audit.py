#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""审计 B2 墙钟口径：同一模型的多局若时间重叠，排队时间会计入 B2。

用法：
  python tools/timing_audit.py [runs_dir] [--strict] [--json]

并发跑三局对引擎状态是安全的，但 B2 是端到端墙钟；同一模型/账号并行
会共享 API 队列，先开跑的局会把等待时间算进 B2。正式成绩应串行跑。
--strict 时发现同模型重叠会以退出码 1 结束，便于 CI/出榜前拦截。
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src" / "scoring"))
from model_identity import canonical_model_id  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass


def epoch(iso):
    if not iso:
        return None
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def first_tool_epoch(path):
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("type") == "tool" and isinstance(rec.get("t"), (int, float)):
            return rec["t"] / 1000.0
    return None


def load_run(run_dir):
    proto = json.loads((run_dir / "protocol.json").read_text(encoding="utf-8"))
    timing = proto.get("timing") or {}
    start = epoch(timing.get("t0_iso")) or epoch(timing.get("process_iso"))
    end = epoch(timing.get("end_iso"))
    proc = epoch(timing.get("process_iso"))
    if start is None or end is None:
        return None
    first = first_tool_epoch(run_dir / "trace.jsonl")
    name = run_dir.name
    return {
        "name": name,
        "model": canonical_model_id(name),
        "start": start,
        "end": end,
        "e2e_min": (end - start) / 60.0,
        "pre_first_min": None if (first is None or proc is None) else (first - proc) / 60.0,
        "overlaps": [],
    }


def collect(root):
    if not root.exists():
        return []
    if (root / "protocol.json").exists():
        dirs = [root]
    else:
        dirs = [p for p in sorted(root.iterdir()) if p.is_dir() and (p / "protocol.json").exists()]
    rows = [r for r in (load_run(d) for d in dirs) if r is not None]
    for a in rows:
        for b in rows:
            if a is b or a["model"] != b["model"]:
                continue
            if max(a["start"], b["start"]) < min(a["end"], b["end"]):
                a["overlaps"].append(b["name"])
    for a in rows:
        a["b2_comparable"] = not a["overlaps"]
    return rows


def build_report(rows):
    any_overlap = any(bool(r["overlaps"]) for r in rows)
    return {
        "ok": not any_overlap,
        "overlapRuns": sum(1 for r in rows if r["overlaps"]),
        "runs": rows,
    }


def main():
    ap = argparse.ArgumentParser(description="检查同模型多局是否并行，导致 B2 墙钟不可比")
    ap.add_argument("runs_dir", nargs="?", default="runs", help="包含多个 run 子目录的目录（默认 runs）")
    ap.add_argument("--strict", action="store_true", help="发现同模型重叠时退出码 1")
    ap.add_argument("--json", action="store_true", help="输出机器可读 JSON，不打印表格")
    args = ap.parse_args()

    rows = collect(Path(args.runs_dir))
    if not rows:
        if args.json:
            print(json.dumps({"ok": False, "overlapRuns": 0, "runs": []}, ensure_ascii=False, indent=2))
        else:
            print("没有找到带 protocol.json 的 run")
        return 1

    report = build_report(rows)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["ok"] or not args.strict else 1

    print(f"{'run':44} {'e2e':>7} {'首动作等待':>10}  同模型重叠")
    print("-" * 86)
    for r in sorted(rows, key=lambda x: (x["start"], x["name"])):
        pre = "-" if r["pre_first_min"] is None else f"{r['pre_first_min']:8.1f}m"
        ov = ", ".join(r["overlaps"]) if r["overlaps"] else "-"
        if r["overlaps"]:
            ov = "[OVERLAP] " + ov
        print(f"{r['name']:44} {r['e2e_min']:6.1f}m {pre:>10}  {ov}")

    if not report["ok"]:
        print("\n警告：上面标 [OVERLAP] 的局与其他同模型局时间重叠。")
        print("B2 是端到端墙钟，同模型/同账号并行的排队时间会算进 B2；正式成绩请串行重跑，")
        print("或在报告中明确标注 B2 不可比、不要用 B2 做模型间比较。")
        return 1 if args.strict else 0
    print("\nOK：未发现同模型多局时间重叠，B2 墙钟口径可用。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

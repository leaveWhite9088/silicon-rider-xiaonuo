# -*- coding: utf-8 -*-
"""汇总中心化追加式评审日志，生成按 pack/case 聚合的 D 分。"""
from pathlib import Path
import sys, json, argparse, datetime

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import review_log

ap = argparse.ArgumentParser()
ap.add_argument("--log", default=str(review_log.DEFAULT_LOG), help="中心评审日志 JSONL")
ap.add_argument("--out", default=None, help="聚合结果 JSON 输出路径")
ap.add_argument("--aggregate", choices=("mean", "median"), default="mean")
ap.add_argument("--min-judges", type=int, default=1)
a = ap.parse_args()

if a.min_judges < 1:
    print("--min-judges 必须 >= 1")
    sys.exit(1)

try:
    reviews = review_log.read_reviews(a.log)
except review_log.ReviewLogError as e:
    print("读取评审日志失败：" + str(e))
    sys.exit(1)
if not reviews:
    print("评审日志为空：" + str(Path(a.log).resolve()))
    sys.exit(1)

used, duplicates = review_log.dedupe_latest(reviews)
groups = review_log.aggregate_reviews(used, a.aggregate)
below = [g for g in groups if g["judge_count"] < a.min_judges]

print(f"评审日志：{Path(a.log).resolve()}")
print(f"原始记录 {len(reviews)} 条；按 (pack_id, case_id, judge_id) 去重后 {len(used)} 条；重复/旧记录 {duplicates} 条")
print(f"聚合方式：{a.aggregate}；case 数：{len(groups)}")
print("")
print(f"{'pack_id':<16}{'case':<10}{'评委数':>6}{'D1':>7}{'D2':>7}{'D3':>7}{'D':>7}")
print("-" * 60)
for g in groups:
    print(f"{g['pack_id']:<16}{g['case_id']:<10}{g['judge_count']:>6}{g['D1']:>7.2f}{g['D2']:>7.2f}{g['D3']:>7.2f}{g['D']:>7.2f}")
if below:
    print("")
    for g in below:
        print(f"!! {g['pack_id']}/{g['case_id']} 只有 {g['judge_count']} 位评委（要求 {a.min_judges}）")

summary = {
    "schema_version": review_log.SCHEMA_VERSION,
    "generated_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
    "log": str(Path(a.log).resolve()),
    "aggregate": a.aggregate,
    "min_judges": a.min_judges,
    "reviews_total": len(reviews),
    "reviews_used": len(used),
    "duplicates_removed": duplicates,
    "groups": groups,
}
if a.out:
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\n聚合结果已写入：{out.resolve()}")

# -*- coding: utf-8 -*-
"""评委提交单条评分：只追加到中心评审日志，不显示其他评委分数。"""
from pathlib import Path
import sys, json, argparse

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import review_log

ap = argparse.ArgumentParser()
ap.add_argument("--pack-dir", required=True, help="评委拿到的 leaderboard/blind/<pack_id>/ 目录")
ap.add_argument("--case-id", required=True)
ap.add_argument("--judge-id", required=True, help="评委唯一 ID（同一位评委的多次提交用同一 ID）")
ap.add_argument("--judge-model", required=True, help="评委模型/姓名，例如 gpt-5、human-A")
ap.add_argument("--D1", type=float, required=True)
ap.add_argument("--D2", type=float, required=True)
ap.add_argument("--D3", type=float, required=True)
ap.add_argument("--evidence", required=True, help="至少引用 2 条事实卡证据，例如 [E01] [F02]")
ap.add_argument("--note", default="", help="最强反证/备注")
ap.add_argument("--review-log", default=str(review_log.DEFAULT_LOG))
a = ap.parse_args()

pack_dir = Path(a.pack_dir).resolve()
manifest_path = pack_dir / "pack.json"
if not manifest_path.exists():
    manifest_path = pack_dir / "verdict.draft.json"   # 兼容旧盲评包
if not manifest_path.exists():
    print(f"找不到盲评包清单：{pack_dir / 'pack.json'}")
    sys.exit(1)
try:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
except Exception as e:
    print(f"盲评包清单读取失败：{e}")
    sys.exit(1)

pack_id = manifest.get("pack_id")
case_ids = [c.get("case_id") for c in (manifest.get("cases") or []) if c.get("case_id")]
if not pack_id or a.case_id not in case_ids:
    print(f"pack_id 或 case_id 无效：pack={pack_id} case={a.case_id}")
    print("可用 case：" + ", ".join(case_ids))
    sys.exit(1)
if not a.evidence.strip():
    print("--evidence 不能为空；请至少引用 2 条事实卡证据。")
    sys.exit(1)

rec = {
    "schema_version": review_log.SCHEMA_VERSION,
    "judge_id": a.judge_id.strip(),
    "judge_model": a.judge_model.strip(),
    "pack_id": pack_id,
    "case_id": a.case_id,
    "D1": a.D1, "D2": a.D2, "D3": a.D3,
    "evidence": a.evidence.strip(),
    "note": a.note.strip(),
}
try:
    saved = review_log.append_review(a.review_log, rec, reject_duplicate=True)
except review_log.DuplicateReviewError as e:
    print("提交失败：" + str(e))
    sys.exit(2)
except review_log.ReviewLogError as e:
    print("提交失败：" + str(e))
    sys.exit(1)

print("评分提交成功。")
print(f"review_id={saved['review_id']}  pack_id={saved['pack_id']}  case_id={saved['case_id']}")
print("本次提交没有读取或显示其他评委的评分。")

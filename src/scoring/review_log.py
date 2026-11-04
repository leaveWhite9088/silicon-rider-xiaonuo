# -*- coding: utf-8 -*-
"""中心化、追加式评审日志的读写与聚合工具。"""
from pathlib import Path
import os, sys, json, time, uuid, statistics, datetime
from contextlib import contextmanager

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DEFAULT_LOG = Path(os.environ.get("SR_REVIEW_LOG") or (ROOT / "leaderboard" / "reviews.jsonl"))
SCHEMA_VERSION = 1
REQUIRED = ("schema_version", "review_id", "created_at", "judge_id", "judge_model",
            "pack_id", "case_id", "D1", "D2", "D3")
D_RANGES = {"D1": (0, 11), "D2": (0, 10), "D3": (0, 9)}


class ReviewLogError(Exception):
    pass


class DuplicateReviewError(ReviewLogError):
    pass


def validate_review(rec):
    if not isinstance(rec, dict):
        raise ReviewLogError("评审记录必须是 JSON object")
    missing = [k for k in REQUIRED if k not in rec]
    if missing:
        raise ReviewLogError("评审记录缺少字段: " + ", ".join(missing))
    if int(rec.get("schema_version", 0)) != SCHEMA_VERSION:
        raise ReviewLogError(f"schema_version 必须是 {SCHEMA_VERSION}")
    for k in ("review_id", "created_at", "judge_id", "judge_model", "pack_id", "case_id"):
        if not isinstance(rec.get(k), str) or not rec[k].strip():
            raise ReviewLogError(f"{k} 必须是非空字符串")
    for k, (lo, hi) in D_RANGES.items():
        v = rec.get(k)
        if not isinstance(v, (int, float)) or not (lo <= v <= hi):
            raise ReviewLogError(f"{k} 必须在 [{lo}, {hi}] 范围内")
    return True


@contextmanager
def _file_lock(log_path: Path, timeout=15.0):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = log_path.with_suffix(log_path.suffix + ".lock")
    deadline = time.time() + timeout
    fd = None
    while True:
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            if time.time() > deadline:
                raise ReviewLogError(f"评审日志被锁定超时：{lock_path}")
            time.sleep(0.05)
    try:
        yield
    finally:
        if fd is not None:
            os.close(fd)
        try:
            lock_path.unlink()
        except FileNotFoundError:
            pass

def read_reviews(log_path=None):
    path = Path(log_path or DEFAULT_LOG)
    if not path.exists():
        return []
    out = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except Exception as e:
            raise ReviewLogError(f"{path}:{lineno}: 不是合法 JSON：{e}")
        try:
            validate_review(rec)
        except ReviewLogError as e:
            raise ReviewLogError(f"{path}:{lineno}: {e}")
        out.append(rec)
    return out


def dedupe_latest(reviews):
    """同一 (pack_id, case_id, judge_id) 只保留时间最新的一条。"""
    by_key = {}
    for rec in reviews:
        key = (rec["pack_id"], rec["case_id"], rec["judge_id"])
        prev = by_key.get(key)
        if prev is None or str(rec.get("created_at", "")) >= str(prev.get("created_at", "")):
            by_key[key] = rec
    return list(by_key.values()), len(reviews) - len(by_key)


def aggregate_reviews(reviews, mode="mean"):
    """按 pack_id + case_id 聚合；mode=mean/median。"""
    if mode not in ("mean", "median"):
        raise ReviewLogError("mode 只能是 mean 或 median")
    groups = {}
    for rec in reviews:
        groups.setdefault((rec["pack_id"], rec["case_id"]), []).append(rec)
    out = []
    for (pack_id, case_id), items in sorted(groups.items()):
        dims = {}
        for dim in ("D1", "D2", "D3"):
            vals = [float(x[dim]) for x in items]
            dims[dim] = round(statistics.mean(vals) if mode == "mean" else statistics.median(vals), 2)
        out.append({
            "pack_id": pack_id,
            "case_id": case_id,
            "judge_count": len(items),
            "D1": dims["D1"], "D2": dims["D2"], "D3": dims["D3"],
            "D": round(dims["D1"] + dims["D2"] + dims["D3"], 2),
            "review_ids": [x.get("review_id") for x in items],
            "judges": [{"judge_id": x.get("judge_id"), "judge_model": x.get("judge_model"),
                        "created_at": x.get("created_at"), "D1": x.get("D1"),
                        "D2": x.get("D2"), "D3": x.get("D3")} for x in items],
        })
    return out

def append_review(log_path, record, reject_duplicate=True):
    """追加一条评审记录。返回最终写入的记录。"""
    path = Path(log_path or DEFAULT_LOG)
    rec = dict(record)
    rec.setdefault("schema_version", SCHEMA_VERSION)
    rec.setdefault("review_id", str(uuid.uuid4()))
    rec.setdefault("created_at", datetime.datetime.now().astimezone().isoformat(timespec="seconds"))
    rec["D1"] = float(rec["D1"])
    rec["D2"] = float(rec["D2"])
    rec["D3"] = float(rec["D3"])
    rec["total"] = round(rec["D1"] + rec["D2"] + rec["D3"], 2)
    validate_review(rec)
    with _file_lock(path):
        existing = read_reviews(path)
        if reject_duplicate:
            key = (rec["pack_id"], rec["case_id"], rec["judge_id"])
            if any((x["pack_id"], x["case_id"], x["judge_id"]) == key for x in existing):
                raise DuplicateReviewError(
                    f"该评委已提交过 pack={rec['pack_id']} case={rec['case_id']}；"
                    "如需更正请联系汇总者，不要重复提交。")
        with path.open("a", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(rec, ensure_ascii=False, separators=(",", ":")) + "\n")
            f.flush()
            os.fsync(f.fileno())
    return rec

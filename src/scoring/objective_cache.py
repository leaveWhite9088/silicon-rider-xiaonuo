# -*- coding: utf-8 -*-
"""客观分（A/B/C）定稿指纹计算与防篡改缓存校验。

核心职责：
1. 计算两项独立校验指纹：
   - scoring_hash：当前评分配置（configs/benchmark.json）与客观评分/回放脚本的整体 SHA-256。
   - deliverables_hash：单局冻结交付物快照（protocol.json / result.json / trace.jsonl）的整体 SHA-256。
2. 生成与核验定稿客观分记录（绑定保密种子与两项指纹的 attestation 防伪摘要），
   确保客观分与盲评分物理分离存储，且仅在配置、脚本与交付物均未变动时安全复用缓存。
"""
from pathlib import Path
import datetime
import hashlib
import json

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

CACHE_SCHEMA_VERSION = 1

DELIVERABLE_FILES = (
    "protocol.json",
    "result.json",
    "trace.jsonl",
)

SCORING_CONFIG_FILES = (
    "configs/benchmark.json",
)

SCORING_SCRIPT_FILES = (
    "src/scoring/metrics.py",
    "src/scoring/score_run.py",
    "src/scoring/objective_cache.py",
    "tools/verify_replay.mjs",
    "src/client/order_distribution.mjs",
    "src/client/movement_tuning.mjs",
)

# 纳入防篡改签名的客观分核心字段（绝不包含任何盲评 D 字段）
OBJECTIVE_SIGNED_FIELDS = (
    "A_outcome",
    "A_out_of_range",
    "B_efficiency",
    "B_detail",
    "C1_constraint9",
    "C2_state8",
    "C3_path8",
    "C_quality",
    "C_levels",
    "total_v2_partial",
    "run_summary",
    "seed_commit",
    "seed_verified",
    "replay_ok",
    "anchor",
    "t0_source",
    "b2_reliable",
)

FORBIDDEN_BLIND_FIELDS = ("D_judged", "D", "D1", "D2", "D3", "judges")


def check_missing_deliverables(run_dir: Path) -> list[str]:
    """返回该局缺失的冻结交付物文件名列表。"""
    run_path = Path(run_dir)
    return [name for name in DELIVERABLE_FILES if not (run_path / name).is_file()]


def _hash_named_files(named_paths: list[tuple[str, Path]], extra_tag: str | None = None) -> str:
    h = hashlib.sha256()
    for rel_name, file_path in named_paths:
        if not file_path.is_file():
            raise FileNotFoundError(f"缺少参与指纹计算的文件: {file_path}")
        raw = file_path.read_bytes()
        h.update(rel_name.encode("utf-8"))
        h.update(b"\0")
        h.update(str(len(raw)).encode("ascii"))
        h.update(b"\0")
        h.update(raw)
        h.update(b"\0")
    if extra_tag is not None:
        h.update(b"extra:")
        h.update(extra_tag.encode("utf-8"))
        h.update(b"\0")
    return h.hexdigest()


def compute_scoring_hash(root: Path = ROOT, anchor_override: float | None = None) -> str:
    """计算当前评分配置与客观评分脚本的整体 SHA-256 哈希。"""
    base = Path(root).resolve()
    rel_list = sorted(set(SCORING_CONFIG_FILES + SCORING_SCRIPT_FILES))
    named_paths = [(rel, base / Path(rel)) for rel in rel_list]
    extra = f"anchor_override={float(anchor_override):.6f}" if anchor_override is not None else None
    return _hash_named_files(named_paths, extra_tag=extra)


def compute_deliverables_hash(run_dir: Path) -> str:
    """计算单局冻结交付物快照（protocol.json / result.json / trace.jsonl）的整体 SHA-256 哈希。"""
    run_path = Path(run_dir).resolve()
    missing = check_missing_deliverables(run_path)
    if missing:
        raise FileNotFoundError(f"运行目录 {run_path.name} 缺少冻结交付物: {', '.join(missing)}")
    named_paths = [(name, run_path / name) for name in DELIVERABLE_FILES]
    return _hash_named_files(named_paths)


def canonical_objective_payload(score_obj: dict) -> str:
    """提取客观分核心字段并序列化为确定性 JSON 字符串。"""
    payload = {k: score_obj.get(k) for k in OBJECTIVE_SIGNED_FIELDS}
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def compute_attestation(seed: int, scoring_hash: str, deliverables_hash: str, score_obj: dict) -> str:
    """基于种子、两项指纹与客观分载荷生成防篡改校验码。"""
    canon = canonical_objective_payload(score_obj)
    material = f"sr-objective-v{CACHE_SCHEMA_VERSION}:{seed}:{scoring_hash}:{deliverables_hash}:{canon}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def build_objective_record(
    raw_score: dict,
    *,
    run_summary: dict,
    seed_commit: str | None,
    seed: int | None,
    seed_verified: bool | None,
    replay_ok: bool | None,
    anchor: float,
    t0_source: str | None,
    b2_reliable: bool,
    scoring_hash: str,
    deliverables_hash: str,
) -> dict:
    """组装定稿客观分记录（不含任何盲评字段），附上两项校验指纹与防伪签名。"""
    out = {k: v for k, v in raw_score.items() if k not in FORBIDDEN_BLIND_FIELDS}
    out["run_summary"] = dict(run_summary)
    out["seed_commit"] = seed_commit
    out["seed_verified"] = seed_verified
    out["replay_ok"] = replay_ok
    out["anchor"] = float(anchor)
    out["t0_source"] = t0_source
    out["b2_reliable"] = bool(b2_reliable)
    out["cache_schema_version"] = CACHE_SCHEMA_VERSION
    out["scoring_hash"] = scoring_hash
    out["deliverables_hash"] = deliverables_hash

    is_finalized = bool(seed is not None and seed_verified is True and replay_ok is True)
    out["finalized"] = is_finalized
    out["finalized_at"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    if seed is not None and seed_verified is True:
        out["attestation"] = compute_attestation(seed, scoring_hash, deliverables_hash, out)
    else:
        out["attestation"] = None
    return out


def verify_objective_cache(
    score_obj: dict,
    *,
    seed: int,
    expected_commit: str | None,
    scoring_hash: str,
    deliverables_hash: str,
    require_replay: bool = True,
) -> tuple[bool, str]:
    """校验已存储的客观分是否可直接复用。

    返回 (is_valid, reason)：
    - (True, "hit")：评分配置、评分脚本与该局交付物均未变化且防伪校验通过，可安全复用。
    - (False, <reason>)：需要重新执行官方客观评测（其中 reason="tampered" 表示疑似被手工篡改）。
    """
    if not isinstance(score_obj, dict):
        return False, "invalid_json"
    if any(k in score_obj and score_obj[k] is not None for k in FORBIDDEN_BLIND_FIELDS):
        return False, "contains_blind_fields"
    if score_obj.get("cache_schema_version") != CACHE_SCHEMA_VERSION:
        return False, "schema_upgrade"
    for req in ("A_outcome", "B_efficiency", "C_quality", "B_detail", "run_summary"):
        if req not in score_obj:
            return False, f"missing_{req}"

    saved_scoring = score_obj.get("scoring_hash")
    saved_deliv = score_obj.get("deliverables_hash")
    if not saved_scoring or not saved_deliv:
        return False, "missing_fingerprints"
    if saved_scoring != scoring_hash:
        return False, "scoring_changed"
    if saved_deliv != deliverables_hash:
        return False, "deliverables_changed"

    if not expected_commit or score_obj.get("seed_commit") != expected_commit:
        return False, "seed_commit_mismatch"
    if score_obj.get("seed_verified") is not True:
        return False, "seed_unverified"

    if require_replay:
        if score_obj.get("replay_ok") is not True or score_obj.get("finalized") is not True:
            return False, "replay_unverified"

    saved_att = score_obj.get("attestation")
    expected_att = compute_attestation(seed, scoring_hash, deliverables_hash, score_obj)
    if not saved_att or saved_att != expected_att:
        return False, "tampered"

    return True, "hit"

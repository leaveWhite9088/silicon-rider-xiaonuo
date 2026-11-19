# -*- coding: utf-8 -*-
"""官方客观评分脚本：对单局冻结交付物计算客观分（A/B/C）、核验种子与回放并写入防篡改校验指纹。

说明：
- 选手阶段严禁运行本脚本或生成/篡改 评分.json；官方客观评分由汇总出榜侧统一核验定稿。
- 客观分与盲评分物理分离存储：评分.json 仅保存客观分与两项校验指纹（scoring_hash / deliverables_hash），
  绝不包含盲评 D 分，也不直接修改 leaderboard/scores.md（总榜仅由 finalize.py 合成生成）。

用法：
    python src/scoring/score_run.py runs/<名> <模型名> [--seed 12345 | --seed-index 1] [--anchor 600] [--no-replay] [--recompute]
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import sys

try:                                    # Windows 控制台默认 GBK，避免打印中文/符号时崩
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent          # src/scoring
ROOT = HERE.parent.parent                       # 仓库根
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import metrics
import objective_cache


def resolve_seed_from_index(seed_index: int, root: Path = ROOT) -> int:
    seeds_file = Path(os.environ.get("SR_SEEDS") or (root.parent / ".sr-seeds" / "seeds.json"))
    if not seeds_file.exists():
        raise RuntimeError(f"找不到种子明文：{seeds_file}（由评测环境放置，或用环境变量 SR_SEEDS 指定）")
    table = {s["index"]: s["seed"] for s in json.loads(seeds_file.read_text(encoding="utf-8"))["seeds"]}
    if seed_index not in table:
        raise RuntimeError(f"种子表里没有序号 {seed_index}")
    return int(table[seed_index])


def score_and_finalize_run(
    folder: Path,
    *,
    seed: int | None = None,
    anchor_override: float | None = None,
    no_replay: bool = False,
    recompute: bool = False,
    scoring_hash: str | None = None,
) -> tuple[dict, dict, bool]:
    """对单局运行目录执行客观评分与定稿（或复用防篡改缓存）。

    返回 (score_record, metrics_summary, from_cache)。
    验证失败时抛出 RuntimeError。
    """
    folder = Path(folder).resolve()
    if not folder.exists():
        raise RuntimeError(f"运行目录不存在: {folder}")

    missing = objective_cache.check_missing_deliverables(folder)
    if missing:
        raise RuntimeError(f"{folder.name}: 缺少冻结交付物 {', '.join(missing)}")

    proto = json.loads((folder / "protocol.json").read_text(encoding="utf-8"))
    res = json.loads((folder / "result.json").read_text(encoding="utf-8"))
    commit = (proto.get("scene") or {}).get("seed_commit")

    seed_ok = None
    if seed is not None:
        calc = hashlib.sha256(("sr:" + str(seed)).encode()).hexdigest()
        seed_ok = (calc == commit)
        if not seed_ok:
            raise RuntimeError(
                f"{folder.name}: 种子承诺不匹配（给定种子哈希 {calc[:12]}… ≠ 记录 {str(commit)[:12]}…，成绩作废）"
            )

    eff_scoring_hash = scoring_hash or objective_cache.compute_scoring_hash(ROOT, anchor_override=anchor_override)
    deliv_hash = objective_cache.compute_deliverables_hash(folder)

    score_path = folder / "评分.json"
    card_path = folder / "factcard.md"
    if not recompute and seed is not None and score_path.is_file() and card_path.is_file():
        try:
            cached = json.loads(score_path.read_text(encoding="utf-8"))
        except Exception:
            cached = None
        ok, _reason = objective_cache.verify_objective_cache(
            cached,
            seed=seed,
            expected_commit=commit,
            scoring_hash=eff_scoring_hash,
            deliverables_hash=deliv_hash,
            require_replay=(not no_replay),
        )
        if ok:
            return cached, cached.get("run_summary") or {}, True

    replay_ok = None
    if seed is not None and not no_replay:
        rr = subprocess.run(
            ["node", str(ROOT / "tools" / "verify_replay.mjs"), str(folder), "--seed", str(seed), "--quiet"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        replay_ok = (rr.returncode == 0)
        if not replay_ok:
            detail = (((rr.stdout or "") + "\n" + (rr.stderr or "")).strip())[-300:]
            raise RuntimeError(f"{folder.name}: 原引擎回放与结算不一致（成绩作废） {detail}".strip())

    prev_anchor = metrics.PROFIT_ANCHOR
    try:
        if anchor_override is not None:
            metrics.PROFIT_ANCHOR = float(anchor_override)
        m = metrics.analyze_work(folder)
        s = metrics.score_work(m)
        card_path.write_text(metrics.factcard(m), encoding="utf-8")
        eff_anchor = metrics.PROFIT_ANCHOR
    finally:
        metrics.PROFIT_ANCHOR = prev_anchor

    run_summary = {
        "rounds": res.get("rounds"),
        "profit": round(float((res.get("score") or {}).get("totalProfit") or 0.0), 2),
        "completed": (res.get("score") or {}).get("completedOrders"),
        "endToEndMin": round(float(res.get("endToEndSeconds") or 0.0) / 60.0, 1),
        "wallMin": round(float(m.get("wallSeconds") or 0.0) / 60.0, 1),
        "onTimeRate": None if m.get("onTimeRate") is None else round(float(m["onTimeRate"]), 3),
        "termination": m.get("termination"),
        "arrivalMode": m.get("arrivalMode"),
        "arrivalBatches": m.get("arrivalBatches"),
        "invalidRatioPct": None if m.get("invalid_ratio") is None else round(float(m["invalid_ratio"]) * 100.0, 2),
        "medianCallGapMs": m.get("medianCallGapMs"),
        "suspectScript": bool(m.get("suspectScript")),
        "overrun": m.get("overrun"),
    }

    out = objective_cache.build_objective_record(
        s,
        run_summary=run_summary,
        seed_commit=commit,
        seed=seed,
        seed_verified=seed_ok,
        replay_ok=replay_ok,
        anchor=eff_anchor,
        t0_source=m.get("t0Source"),
        b2_reliable=bool(m.get("endToEndSeconds") is not None or m.get("wallSeconds")),
        scoring_hash=eff_scoring_hash,
        deliverables_hash=deliv_hash,
    )
    score_path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    return out, run_summary, False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("model")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--seed-index", type=int, default=None, help="预注册序号（推荐：明文由脚本读取，人不接触）")
    ap.add_argument("--anchor", type=float, default=None)
    ap.add_argument("--no-replay", action="store_true", help="跳过回放核验（仅开发自检，不标记正式定稿）")
    ap.add_argument("--recompute", "--force-recompute", dest="recompute", action="store_true",
                    help="忽略已有客观分缓存，强制重新计算客观分与回放核验")
    ap.add_argument("--no-record", action="store_true", help="兼容保留参数：score_run.py 现统一只写客观分，不再改写总榜")
    a = ap.parse_args()

    seed = a.seed
    if seed is None and a.seed_index is not None:
        try:
            seed = resolve_seed_from_index(a.seed_index, ROOT)
        except RuntimeError as e:
            print(str(e))
            sys.exit(1)

    try:
        out, rs, from_cache = score_and_finalize_run(
            Path(a.folder),
            seed=seed,
            anchor_override=a.anchor,
            no_replay=a.no_replay,
            recompute=a.recompute,
        )
    except RuntimeError as e:
        print(f"!! {e}")
        sys.exit(1)

    cache_tag = "复用已定稿缓存" if from_cache else ("已定稿" if out.get("finalized") else "未定稿草稿")
    print(
        f"客观评分完成（{cache_tag}）：A={out['A_outcome']} B={out['B_efficiency']} "
        f"C={out['C_quality']} 小计={out['total_v2_partial']}"
    )
    print(
        f"校验指纹：scoring={out['scoring_hash'][:12]}… deliverables={out['deliverables_hash'][:12]}…"
    )
    print(
        f"调用节奏中位间隔 {rs.get('medianCallGapMs')} ms"
        + ("（疑似脚本代打）" if rs.get("suspectScript") else "")
        + f"；越线={rs.get('overrun')}"
    )


if __name__ == "__main__":
    main()

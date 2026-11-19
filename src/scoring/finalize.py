# -*- coding: utf-8 -*-
"""汇总出榜：独立校验（或复用缓存）客观分 A/B/C，实时读取盲评 D 分合成总分与排行榜。

核心机制：
1) 客观分与盲评分分离存储、独立校验：
   - 客观分定稿于各局 评分.json（含评分配置/脚本整体哈希 scoring_hash、冻结交付物快照哈希 deliverables_hash 及种子防伪摘要）；
   - 盲评分独立存储于中心追加日志 leaderboard/reviews.jsonl（绝不缓存在客观分中）。
2) 防篡改客观分缓存：
   - 汇总时先核对两项指纹与防伪摘要；均未变化时直接复用已定稿客观分，跳过客观计分与回放探针重跑；
   - 仅对新增、交付物变动、评分标准/脚本更新或签名异常的局重新执行官方客观评测；
   - 提供 --recompute（别名 --force-recompute）开关支持强制全量重算。
3) 盲评随时重评、实时生效：
   - 每次执行汇总均实时读取最新盲评记录（同一评委重评自动取最新一条），立即重新合成总分并刷新总榜。
4) 多局明细与算术平均排名：
   - 同一模型有多局运行记录时保留每一局详细明细，总榜严格按多局总分的算术平均数排名。
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import statistics
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import objective_cache
import review_log
import score_run
from model_identity import canonical_model_id

DEFAULT_LEADERBOARD = ROOT / "leaderboard" / "scores.md"
DEFAULT_VERDICTS = ROOT / "leaderboard" / "verdicts"
DEFAULT_BLIND_MAPS = ROOT / "leaderboard" / "blind-maps"


def _load_seeds_table(root: Path = ROOT) -> list[dict]:
    seeds_file = Path(os.environ.get("SR_SEEDS") or (root.parent / ".sr-seeds" / "seeds.json"))
    if not seeds_file.exists():
        raise RuntimeError(f"找不到种子明文：{seeds_file}（由评测环境放置，或用环境变量 SR_SEEDS 指定）")
    return json.loads(seeds_file.read_text(encoding="utf-8"))["seeds"]


def _resolve_seeds_for_runs(runs: list[Path], seed_indexes_arg: str | None, seeds_arg: str | None,
                            seeds_table_cache: list[dict] | None = None) -> tuple[list[int], list[dict] | None]:
    if seed_indexes_arg:
        idxs = [int(x) for x in seed_indexes_arg.split(",")]
        if seeds_table_cache is None:
            seeds_table_cache = _load_seeds_table(ROOT)
        by_idx = {int(s["index"]): int(s["seed"]) for s in seeds_table_cache}
        try:
            return [by_idx[i] for i in idxs], seeds_table_cache
        except KeyError as e:
            raise RuntimeError(f"种子表里没有序号 {e}")
    if seeds_arg:
        return [int(x) for x in seeds_arg.split(",")], seeds_table_cache

    if seeds_table_cache is None:
        seeds_table_cache = _load_seeds_table(ROOT)
    commit_to_seed = {
        hashlib.sha256(("sr:" + str(s["seed"])).encode()).hexdigest(): int(s["seed"])
        for s in seeds_table_cache
    }
    seeds = []
    for run in runs:
        proto_path = run / "protocol.json"
        if not proto_path.exists():
            raise RuntimeError(f"缺少 protocol.json，无法自动推断种子：{run}")
        proto = json.loads(proto_path.read_text(encoding="utf-8"))
        commit = (proto.get("scene") or {}).get("seed_commit")
        seed = commit_to_seed.get(commit)
        if seed is None:
            raise RuntimeError(f"种子表里没有与 {run.name} 的承诺匹配的种子")
        seeds.append(seed)
    return seeds, seeds_table_cache


def _load_realtime_review_groups(review_log_path: str, d_aggregate: str) -> tuple[dict, int]:
    """实时读取最新盲评日志并按 (pack_id, case_id) 聚合，绝不缓存。"""
    try:
        reviews = review_log.read_reviews(review_log_path)
    except review_log.ReviewLogError as e:
        raise RuntimeError("读取评审日志失败：" + str(e))
    if not reviews:
        raise RuntimeError("评审日志为空：" + str(Path(review_log_path).resolve()))
    used, duplicates = review_log.dedupe_latest(reviews)
    groups = review_log.aggregate_reviews(used, d_aggregate)
    by_key = {(g["pack_id"], g["case_id"]): g for g in groups}
    return by_key, duplicates


def _parse_existing_leaderboard(leaderboard_path: Path) -> tuple[str, dict[str, str], list[str]]:
    """拆分 scores.md 的榜头与已有各模型明细段落。"""
    if not leaderboard_path.exists():
        default_head = "# 排行榜 · silicon-rider-xiaonuo\n\n"
        return default_head, {}, []
    raw = leaderboard_path.read_text(encoding="utf-8")
    head_part, sep, body = raw.partition("### 最终成绩")
    head = head_part.split("<!-- 大榜 -->")[0].split("## 大榜（按各模型总分均值排名）")[0].rstrip() + "\n\n"
    sec_by_model = {}
    extra_secs = []
    if sep:
        raw_secs = (sep + body).split("\n### 最终成绩")
        for idx, s in enumerate(raw_secs):
            chunk = (s if idx == 0 else "### 最终成绩" + s).strip()
            if not chunk:
                continue
            first_line = chunk.splitlines()[0]
            if first_line.startswith("### 最终成绩 · "):
                m_part = first_line[len("### 最终成绩 · "):].split(" — ", 1)[0].strip()
                sec_by_model[m_part] = chunk
            else:
                extra_secs.append(chunk)
    return head, sec_by_model, extra_secs


def _write_sorted_leaderboard(
    leaderboard_path: Path,
    verdicts_dir: Path,
    updated_sections: dict[str, str],
    *,
    replace_all: bool,
):
    """按最新裁决的多局算术平均总分重排大榜与各模型明细，写入 scores.md。"""
    head, existing_secs, extra_secs = _parse_existing_leaderboard(leaderboard_path)
    if replace_all:
        sec_by_model = dict(updated_sections)
        extra_secs = []
        target_models = list(updated_sections.keys())
    else:
        sec_by_model = dict(existing_secs)
        sec_by_model.update(updated_sections)
        target_models = sorted(
            {vf.stem for vf in verdicts_dir.glob("*.json")} | set(sec_by_model.keys())
        )

    board = []
    for mid in target_models:
        vf = verdicts_dir / f"{mid}.json"
        if vf.is_file():
            try:
                board.append(json.loads(vf.read_text(encoding="utf-8")))
            except Exception:
                pass
    board.sort(key=lambda v: (-(v.get("mean", {}).get("total") or 0.0), v.get("model", "")))

    blines = [
        "## 大榜（按各模型总分均值排名）",
        "",
        "| 排名 | 模型 | 总分(100) | A(30) | B1无效(5) | B2耗时(10) | C1约束(9) | C2状态(8) | C3路径(8) | D1挑单(11) | D2组合(10) | D3风险(9) | 净利均值 | 耗时(分钟) | 已评run |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]

    def cell(m, k):
        x = m.get(k) if isinstance(m, dict) else None
        return f"{x:.2f}" if isinstance(x, (int, float)) else "-"

    for i, v in enumerate(board, 1):
        m = v.get("mean") or {}
        s = v.get("summary") or {}
        e2e = [r["endToEndMin"] for r in v.get("runs", []) if isinstance(r.get("endToEndMin"), (int, float))]
        e2e_mean = f"{statistics.mean(e2e):.1f}" if e2e else "-"
        blines.append(
            f"| {i} | {v['model']} | **{m['total']:.2f}** | {cell(m, 'A')} | {cell(m, 'B1')} | {cell(m, 'B2')} "
            f"| {cell(m, 'C1')} | {cell(m, 'C2')} | {cell(m, 'C3')} | {cell(m, 'D1')} | {cell(m, 'D2')} | {cell(m, 'D3')} "
            f"| {m['profit']:.1f} | {e2e_mean} | {s.get('runs_scored', '-')} |"
        )
    blines += ["", ""]

    ordered_secs = [sec_by_model.pop(v["model"]) for v in board if v.get("model") in sec_by_model]
    ordered_secs.extend(sec_by_model.values())
    ordered_secs.extend(extra_secs)
    detail_text = ("\n\n".join(ordered_secs) + "\n") if ordered_secs else ""

    leaderboard_path.parent.mkdir(parents=True, exist_ok=True)
    leaderboard_path.write_text(head + "\n".join(blines) + detail_text, encoding="utf-8")


def finalize_model(
    target_model: str,
    args,
    *,
    scoring_hash: str,
    review_groups_cache: dict | None = None,
    seeds_table_cache: list[dict] | None = None,
    blind_maps_dir: Path = DEFAULT_BLIND_MAPS,
    verdicts_dir: Path = DEFAULT_VERDICTS,
) -> tuple[dict, str, list[dict] | None]:
    """汇总单个规范模型 ID：校验/复用客观分缓存 + 实时合成盲评分。返回 (verdict_obj, section_markdown, seeds_table_cache)。"""
    model_id = (args.model_id.strip().lower() if args.model_id else canonical_model_id(target_model)).strip()
    if not model_id:
        raise RuntimeError("--model/--model-id 不能为空")

    map_args = args.blind_map or []
    map_files = [Path(p).resolve() for p in map_args]
    if not map_files and blind_maps_dir.exists():
        for mf in sorted(blind_maps_dir.glob("*.blind-map.json")):
            try:
                bm = json.loads(mf.read_text(encoding="utf-8"))
            except Exception:
                continue
            map_model_id = canonical_model_id(bm.get("model_id") or bm.get("model", ""))
            if map_model_id == model_id:
                map_files.append(mf)
    map_files = list(dict.fromkeys(map_files))

    blind_maps = []
    model_inputs = {target_model}
    run_to_case = {}
    run_to_pack = {}
    run_to_raw_path = {}
    for mf in map_files:
        if not mf.exists():
            raise RuntimeError(f"找不到盲评映射：{mf}")
        bm = json.loads(mf.read_text(encoding="utf-8"))
        map_model_id = canonical_model_id(bm.get("model_id") or bm.get("model", ""))
        if map_model_id and map_model_id != model_id:
            raise RuntimeError(
                f"盲评映射模型 {bm.get('model') or map_model_id}（规范 ID {map_model_id}）"
                f"与 --model {target_model}（规范 ID {model_id}）不一致"
            )
        if bm.get("model"):
            model_inputs.add(bm["model"])
        elif bm.get("model_id"):
            model_inputs.add(bm["model_id"])
        pack_id = bm.get("pack_id")
        if not pack_id:
            raise RuntimeError(f"映射缺少 pack_id：{mf}")
        for cid, meta in (bm.get("cases") or {}).items():
            raw_run = meta.get("run")
            if not raw_run:
                continue
            run_name = Path(raw_run).name
            if run_name in run_to_case:
                raise RuntimeError(f"run {run_name} 出现在多个映射中")
            run_to_case[run_name] = cid
            run_to_pack[run_name] = pack_id
            run_to_raw_path[run_name] = raw_run
        blind_maps.append(bm)

    blind_pack_id = blind_maps[0].get("pack_id") if len(blind_maps) == 1 else None
    runs_root = Path(args.runs_dir).resolve() if getattr(args, "runs_dir", None) else (ROOT / "runs")

    if args.runs:
        runs = [Path(p).resolve() for p in args.runs]
    elif run_to_case:
        runs = []
        for run_name in sorted(run_to_case):
            candidate = runs_root / run_name
            if not candidate.exists():
                candidate = Path(run_to_raw_path[run_name])
            runs.append(candidate.resolve())
    else:
        raise RuntimeError("必须给 --runs，或提供包含 run 的 --blind-map")

    seeds, seeds_table_cache = _resolve_seeds_for_runs(runs, args.seed_indexes, args.seeds, seeds_table_cache)

    # ---- 实时读取盲评打分（绝不缓存） ----
    d_source = None
    d_aggregate = None
    d_counts = []
    ds = []
    d_dims = []
    case_ids = []
    pack_ids = []
    runs_total_all = len(runs)

    if args.review_log:
        d_source = "review_log"
        d_aggregate = args.d_aggregate
        if review_groups_cache is not None:
            by_key = review_groups_cache
        else:
            by_key, duplicates = _load_realtime_review_groups(args.review_log, args.d_aggregate)
            if duplicates:
                print(f"!! 评审日志有 {duplicates} 条重评历史记录，已按 judge_id 实时采用最新一条")
        if not run_to_pack:
            raise RuntimeError("--review-log 需要 --blind-map（或默认私有映射）来确定 pack_id")
        for r in runs:
            cid = run_to_case.get(r.name)
            pack_id = run_to_pack.get(r.name)
            if not cid or not pack_id:
                if args.allow_partial:
                    print(f"!! {r.name} 不在任何映射中，跳过")
                    ds.append(None); d_dims.append(None); case_ids.append(None); pack_ids.append(None); d_counts.append(0)
                    continue
                raise RuntimeError(f"私有映射里没有 {r.name}")
            g = by_key.get((pack_id, cid))
            if not g or g["judge_count"] < args.min_judges:
                if args.allow_partial:
                    print(f"!! {r.name} 尚无足够评分，跳过")
                    ds.append(None); d_dims.append(None); case_ids.append(cid); pack_ids.append(pack_id); d_counts.append(0)
                    continue
                if not g:
                    raise RuntimeError(f"评审日志里没有 pack={pack_id} case={cid}（run={r.name}）")
                raise RuntimeError(f"{r.name} 只有 {g['judge_count']} 位评委，少于 --min-judges {args.min_judges}")
            ds.append(g["D"])
            d_dims.append({"D1": g["D1"], "D2": g["D2"], "D3": g["D3"]})
            case_ids.append(cid)
            pack_ids.append(pack_id)
            d_counts.append(g["judge_count"])
    elif args.d_file:
        d_source = "d_file"
        draft = json.loads(Path(args.d_file).read_text(encoding="utf-8"))
        draft_pack_id = draft.get("pack_id")
        if draft_pack_id and blind_pack_id and draft_pack_id != blind_pack_id:
            raise RuntimeError(f"盲评草稿 pack_id={draft_pack_id} 与私有映射 pack_id={blind_pack_id} 不一致")
        draft_cases = draft.get("cases") or draft.get("seeds", [])
        by_run = {s.get("run"): s for s in draft_cases if s.get("run")}
        by_case = {s.get("case_id"): s for s in draft_cases if s.get("case_id")}
        for r in runs:
            cid = run_to_case.get(r.name)
            pack_id = run_to_pack.get(r.name)
            item = by_run.get(r.name) or (by_case.get(cid) if cid else None)
            if not item:
                if args.allow_partial:
                    print(f"!! {r.name} 草稿里没有评分，跳过")
                    ds.append(None); d_dims.append(None); case_ids.append(cid); pack_ids.append(pack_id); d_counts.append(0)
                    continue
                raise RuntimeError(f"草稿里没有 {r.name}" + (f"（期望 case_id={cid}）" if cid else "；如果是盲评草稿，请给 --blind-map"))
            totals = []
            dim_vals = {"D1": [], "D2": [], "D3": []}
            for j in item.get("judges", []):
                if all(isinstance(j.get(k), (int, float)) for k in ("D1", "D2", "D3")):
                    if not (0 <= j["D1"] <= 11 and 0 <= j["D2"] <= 10 and 0 <= j["D3"] <= 9):
                        raise RuntimeError(f"{r.name} 的 D 分超出范围：D1≤11 / D2≤10 / D3≤9")
                    totals.append(j["D1"] + j["D2"] + j["D3"])
                    for k in dim_vals:
                        dim_vals[k].append(j[k])
            if not totals or len(totals) < args.min_judges:
                if args.allow_partial:
                    print(f"!! {r.name} 尚无足够评分，跳过")
                    ds.append(None); d_dims.append(None); case_ids.append(item.get("case_id") or cid); pack_ids.append(pack_id); d_counts.append(len(totals))
                    continue
                if not totals:
                    raise RuntimeError(f"{r.name} 的 D 还没填（D1/D2/D3）")
                raise RuntimeError(f"{r.name} 只有 {len(totals)} 位有效评委，少于 --min-judges {args.min_judges}")
            ds.append(round(statistics.median(totals), 2))
            d_dims.append({k: round(statistics.median(v), 2) for k, v in dim_vals.items()})
            case_ids.append(item.get("case_id") or cid)
            pack_ids.append(pack_id)
            d_counts.append(len(totals))
    elif args.d:
        d_source = "direct"
        ds = [float(x) for x in args.d.split(",")]
        d_dims = [None] * len(runs)
        case_ids = [None] * len(runs)
        pack_ids = [run_to_pack.get(r.name) for r in runs]
        d_counts = [None] * len(runs)
    else:
        raise RuntimeError("必须给 --review-log / --d-file / --d")

    rounds_total_all = 0
    for r0 in runs:
        try:
            rounds_total_all += int(json.loads((r0 / "result.json").read_text(encoding="utf-8")).get("rounds") or 0)
        except Exception:
            pass
    judge_reviews_all = sum(x or 0 for x in d_counts)
    scored_indices = [i for i, d in enumerate(ds) if d is not None]
    if not scored_indices:
        raise RuntimeError("没有可汇总的已评分 run")

    runs = [runs[i] for i in scored_indices]
    seeds = [seeds[i] for i in scored_indices]
    ds = [ds[i] for i in scored_indices]
    d_dims = [d_dims[i] for i in scored_indices]
    case_ids = [case_ids[i] for i in scored_indices]
    pack_ids = [pack_ids[i] for i in scored_indices]
    d_counts = [d_counts[i] for i in scored_indices]

    if not (len(runs) == len(seeds) == len(ds)):
        raise RuntimeError(f"--runs / 种子 / D 数量必须一致（现在 {len(runs)}/{len(seeds)}/{len(ds)}）")

    # ---- 客观分独立校验与防篡改缓存复用 ----
    rows, errors = [], []
    cache_hits, recomputed = 0, 0
    for run, seed, d, dims, case_id, judge_count, pack_id in zip(runs, seeds, ds, d_dims, case_ids, d_counts, pack_ids):
        name = run.name
        missing = objective_cache.check_missing_deliverables(run)
        if missing:
            errors.append(f"{name}: 缺少冻结交付物 {', '.join(missing)}")
            continue

        proto = json.loads((run / "protocol.json").read_text(encoding="utf-8"))
        commit = (proto.get("scene") or {}).get("seed_commit")
        calc = hashlib.sha256(("sr:" + str(seed)).encode()).hexdigest()
        if calc != commit:
            errors.append(f"{name}: 种子承诺不匹配（给定 {seed}）")
            continue

        deliv_hash = objective_cache.compute_deliverables_hash(run)
        score_path = run / "评分.json"
        sc = None
        used_cache = False

        if not args.recompute and score_path.is_file():
            try:
                candidate_sc = json.loads(score_path.read_text(encoding="utf-8"))
            except Exception:
                candidate_sc = None
            ok, reason = objective_cache.verify_objective_cache(
                candidate_sc,
                seed=seed,
                expected_commit=commit,
                scoring_hash=scoring_hash,
                deliverables_hash=deliv_hash,
                require_replay=(not args.no_replay),
            )
            if ok:
                sc = candidate_sc
                used_cache = True
                cache_hits += 1
            elif reason in ("tampered", "contains_blind_fields"):
                print(f"!! 告警：{name}/评分.json 校验异常（{reason}），忽略该文件并强制重新执行官方客观评测")

        if sc is None:
            try:
                sc, _rs, _ = score_run.score_and_finalize_run(
                    run,
                    seed=seed,
                    no_replay=args.no_replay,
                    recompute=True,
                    scoring_hash=scoring_hash,
                )
                recomputed += 1
            except RuntimeError as e:
                errors.append(str(e))
                continue

        res = json.loads((run / "result.json").read_text(encoding="utf-8"))
        rs = sc.get("run_summary") or {}
        A, B, C = sc.get("A_outcome"), sc.get("B_efficiency"), sc.get("C_quality")
        bd = sc.get("B_detail") or {}
        dd = dims or {}
        replay_ok = sc.get("replay_ok")
        rows.append({
            "run": name,
            "pack_id": pack_id,
            "case_id": case_id,
            "judge_count": judge_count,
            "rounds": rs.get("rounds") if "rounds" in rs else res.get("rounds"),
            "seed_commit": str(commit)[:12],
            "seed_verified": True,
            "replay_ok": replay_ok,
            "objective_cached": used_cache,
            "scoring_hash": sc.get("scoring_hash"),
            "deliverables_hash": sc.get("deliverables_hash"),
            "profit": rs.get("profit") if "profit" in rs else round(float((res.get("score") or {}).get("totalProfit") or 0), 2),
            "completed": rs.get("completed") if "completed" in rs else (res.get("score") or {}).get("completedOrders"),
            "endToEndMin": rs.get("endToEndMin") if "endToEndMin" in rs else round(float(res.get("endToEndSeconds") or 0) / 60, 1),
            "A": A, "B": B, "C": C, "D": d,
            "total": round((A or 0) + (B or 0) + (C or 0) + d, 2),
            "B1": bd.get("B1_invalid5"), "B2": bd.get("B2_time10"),
            "C1": sc.get("C1_constraint9"), "C2": sc.get("C2_state8"), "C3": sc.get("C3_path8"),
            "D1": dd.get("D1"), "D2": dd.get("D2"), "D3": dd.get("D3"),
        })

    if errors:
        msg = "不能出榜：\n" + "\n".join("  !! " + e for e in errors)
        raise RuntimeError(msg)

    def agg(key):
        vals = [r[key] for r in rows if isinstance(r[key], (int, float))]
        return (statistics.mean(vals), (max(vals) - min(vals)) / 2) if vals else (None, None)

    def f2(x):
        return f"{x:.2f}" if isinstance(x, (int, float)) else "-"

    lines = [
        f"\n### 最终成绩 · {model_id} — {datetime.datetime.now():%Y-%m-%d %H:%M}",
        "",
        "| 种子 | 净利 | 单数 | 耗时(分钟) | A(30) | B1无效(5) | B2耗时(10) | C1约束(9) | C2状态(8) | C3路径(8) | D1挑单(11) | D2组合(10) | D3风险(9) | D评委 | 总分(100) | 承诺 | 回放 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        lines.append(
            f"| {r['seed_commit']} | {r['profit']:.1f} | {r['completed']} | {r['endToEndMin']:.1f} "
            f"| {f2(r['A'])} | {f2(r['B1'])} | {f2(r['B2'])} | {f2(r['C1'])} | {f2(r['C2'])} | {f2(r['C3'])} "
            f"| {f2(r['D1'])} | {f2(r['D2'])} | {f2(r['D3'])} | {r['judge_count'] if r['judge_count'] is not None else '-'} | {r['total']:.2f} "
            f"| {'✓' if r['seed_verified'] else '✗'} | {'✓' if r['replay_ok'] in (True, None) else '✗'} |"
        )
    mA, rA = agg("A"); mB, rB = agg("B"); mC, rC = agg("C")
    mD, rD = agg("D"); mT, rT = agg("total"); mP, rP = agg("profit")
    mCompleted, _ = agg("completed"); mE2E, _ = agg("endToEndMin")
    mB1, rB1 = agg("B1"); mB2, rB2 = agg("B2")
    mC1, rC1 = agg("C1"); mC2, rC2 = agg("C2"); mC3, rC3 = agg("C3")
    mD1, rD1 = agg("D1"); mD2, rD2 = agg("D2"); mD3, rD3 = agg("D3")
    lines.append(
        f"| **平均** | {mP:.1f} | {mCompleted:.1f} | {mE2E:.1f} "
        f"| {f2(mA)} | {f2(mB1)} | {f2(mB2)} | {f2(mC1)} | {f2(mC2)} | {f2(mC3)} "
        f"| {f2(mD1)} | {f2(mD2)} | {f2(mD3)} | - | **{mT:.2f}** | - | - |"
    )
    lines += [
        "",
        f"**均值 ± 极差**：净利 {mP:.1f} ±{rP:.1f}｜A {mA:.2f} ±{rA:.2f}｜B {mB:.2f} ±{rB:.2f}"
        f"｜C {mC:.2f} ±{rC:.2f}｜D {mD:.2f} ±{rD:.2f}｜**总分 {mT:.2f} ±{rT:.2f}**",
        "",
        f"- 模型汇总：运行 {runs_total_all} 次（已评分 {len(rows)} 次），评委记录 {judge_reviews_all} 条，累计模拟轮次 {rounds_total_all}。",
        f"- 客观分核验：复用已定稿缓存 {cache_hits} 局，重算定稿 {recomputed} 局（scoring_hash `{scoring_hash[:12]}…`）；盲评 D 实时读取自={d_source or 'd-file'}，聚合={d_aggregate or 'legacy-median'}。",
    ]
    section_text = "\n".join(lines)
    print(section_text)

    verdict_obj = {
        "model": model_id,
        "model_inputs": sorted(model_inputs),
        "finalized_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "scoring_hash": scoring_hash,
        "blind_pack_id": blind_pack_id,
        "blind_pack_ids": sorted({r["pack_id"] for r in rows if r.get("pack_id")}),
        "review_log": args.review_log,
        "d_source": d_source,
        "d_aggregate": d_aggregate,
        "summary": {
            "runs_total": runs_total_all,
            "runs_scored": len(rows),
            "judge_reviews": judge_reviews_all,
            "rounds_total": rounds_total_all,
            "objective_cache_hits": cache_hits,
            "objective_recomputed": recomputed,
        },
        "runs": rows,
        "mean": {
            "profit": mP, "A": mA, "B": mB, "C": mC, "D": mD, "total": mT,
            "B1": mB1, "B2": mB2, "C1": mC1, "C2": mC2, "C3": mC3, "D1": mD1, "D2": mD2, "D3": mD3,
        },
        "range_half": {
            "profit": rP, "A": rA, "B": rB, "C": rC, "D": rD, "total": rT,
            "B1": rB1, "B2": rB2, "C1": rC1, "C2": rC2, "C3": rC3, "D1": rD1, "D2": rD2, "D3": rD3,
        },
    }

    if not args.dry_run:
        verdicts_dir.mkdir(parents=True, exist_ok=True)
        (verdicts_dir / f"{model_id}.json").write_text(
            json.dumps(verdict_obj, ensure_ascii=False, indent=1), encoding="utf-8"
        )
    return verdict_obj, section_text.strip(), seeds_table_cache


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=None, help="规范模型名；不填时按 leaderboard/blind-maps/ 自动发现所有模型，逐个一次性出榜")
    ap.add_argument("--model-id", default=None, help="汇总分组用的规范模型名；默认从 --model 去掉批次后缀")
    ap.add_argument("--runs", nargs="*", default=None, help="要汇总的 run 目录；不填时从 blind-map 自动发现")
    ap.add_argument("--seed-indexes", default=None, help="预注册序号，逗号分隔（推荐）")
    ap.add_argument("--seeds", default=None, help="明文种子，逗号分隔（与 --seed-indexes 二选一）")
    ap.add_argument("--d", default=None, help="每个种子一个 D，逗号分隔")
    ap.add_argument("--review-log", default=None, help="中心化追加式评审日志 JSONL；提供后每次实时重新读取聚合 D")
    ap.add_argument("--d-file", default=None, help="兼容旧盲评草稿 JSON")
    ap.add_argument("--d-aggregate", choices=("mean", "median"), default="mean", help="从评审日志聚合 D 的方式")
    ap.add_argument("--min-judges", type=int, default=1, help="每个 case 至少需要多少位评委")
    ap.add_argument("--blind-map", action="append", default=None, help="盲评私有映射 JSON，可重复；不填时按规范模型 ID 自动发现 leaderboard/blind-maps/*.blind-map.json")
    ap.add_argument("--recompute", "--force-recompute", dest="recompute", action="store_true",
                    help="强制重算所有局的客观分与引擎回放核验，忽略已有防篡改缓存")
    ap.add_argument("--no-replay", action="store_true", help="跳过回放核验（不建议，仅调试）")
    ap.add_argument("--allow-partial", action="store_true", help="允许部分 run 尚无评分；汇总只使用已评分 run")
    ap.add_argument("--dry-run", action="store_true", help="只打印，不写榜")
    ap.add_argument("--leaderboard-out", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--verdicts-dir", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--blind-maps-dir", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--runs-dir", default=None, help=argparse.SUPPRESS)
    return ap


def main(argv=None) -> int:
    ap = build_parser()
    a = ap.parse_args(argv)

    if a.min_judges < 1:
        print("--min-judges 必须 >= 1")
        return 1

    leaderboard_path = Path(a.leaderboard_out).resolve() if a.leaderboard_out else DEFAULT_LEADERBOARD
    verdicts_dir = Path(a.verdicts_dir).resolve() if a.verdicts_dir else DEFAULT_VERDICTS
    blind_maps_dir = Path(a.blind_maps_dir).resolve() if a.blind_maps_dir else DEFAULT_BLIND_MAPS

    scoring_hash = objective_cache.compute_scoring_hash(ROOT)

    review_groups_cache = None
    if a.review_log:
        try:
            review_groups_cache, duplicates = _load_realtime_review_groups(a.review_log, a.d_aggregate)
            if duplicates:
                print(f"!! 评审日志含 {duplicates} 条同评委重评历史记录，已实时采用最新打分")
        except RuntimeError as e:
            print(str(e))
            return 1

    if not a.model:
        discovered = []
        if blind_maps_dir.exists():
            for mf in sorted(blind_maps_dir.glob("*.blind-map.json")):
                try:
                    bm = json.loads(mf.read_text(encoding="utf-8"))
                except Exception:
                    continue
                mid = canonical_model_id(bm.get("model_id") or bm.get("model", ""))
                if mid and mid not in discovered:
                    discovered.append(mid)
        if not discovered:
            print("未指定 --model，且 blind-maps 目录里没有可发现的模型")
            return 1
        print(f"未指定 --model，一次性出榜 {len(discovered)} 个模型：{', '.join(discovered)}")
        if a.recompute:
            print("已启用 --recompute：强制全量重算所有局客观分与回放核验")

        updated_sections = {}
        failed = []
        seeds_table_cache = None
        for mid in discovered:
            print(f"\n===== {mid} =====")
            try:
                _v, sec_md, seeds_table_cache = finalize_model(
                    mid, a,
                    scoring_hash=scoring_hash,
                    review_groups_cache=review_groups_cache,
                    seeds_table_cache=seeds_table_cache,
                    blind_maps_dir=blind_maps_dir,
                    verdicts_dir=verdicts_dir,
                )
                updated_sections[mid] = sec_md
            except RuntimeError as e:
                print(str(e))
                failed.append(mid)

        if not a.dry_run and updated_sections:
            _write_sorted_leaderboard(leaderboard_path, verdicts_dir, updated_sections, replace_all=True)
            print(f"\n大榜与各模型明细已按多局算术平均总分排名写入 {leaderboard_path}")
        elif a.dry_run:
            print("\n[dry-run] 未写入榜单与裁决文件。")

        if failed:
            print(f"\n以下模型出榜失败：{', '.join(failed)}")
            return 1
        return 0

    # 单模型出榜
    try:
        verdict_obj, sec_md, _ = finalize_model(
            a.model, a,
            scoring_hash=scoring_hash,
            review_groups_cache=review_groups_cache,
            blind_maps_dir=blind_maps_dir,
            verdicts_dir=verdicts_dir,
        )
    except RuntimeError as e:
        print(str(e))
        return 1

    if a.dry_run:
        print("\n[dry-run] 未写入榜单与裁决文件。")
        return 0

    _write_sorted_leaderboard(leaderboard_path, verdicts_dir, {verdict_obj["model"]: sec_md}, replace_all=False)
    print(f"\n已更新：{leaderboard_path} 与 {verdicts_dir / (verdict_obj['model'] + '.json')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

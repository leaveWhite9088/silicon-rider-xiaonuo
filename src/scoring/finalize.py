# -*- coding: utf-8 -*-
"""出榜：把 N 个种子的脚本分（A/B/C）与裁判 D 分合成总分，写入排行榜。

用法（推荐，种子用预注册序号，明文由脚本自己读，人不接触）：
    python src/scoring/finalize.py --model Demo \
        --runs runs/Demo-s1 runs/Demo-s2 runs/Demo-s3 \
        --seed-indexes 1,2,3 \
        --review-log leaderboard/reviews.jsonl \
        --blind-map leaderboard/verdicts/Demo.blind-map.json \
        --d-aggregate mean --min-judges 1

也可直接用明文/直接给分：
    ... --seeds 111,222,333 --d 21,22.5,23

可选：--no-replay（跳过回放核验，仅调试）、--dry-run（只打印不写榜）。

流程：
  1) 核对每个种子的承诺（sha256("sr:"+seed) == protocol.scene.seed_commit）
  2) 逐目录回放核验（tools/verify_replay.mjs），不一致直接拒绝出榜
  3) 读 评分.json（A/B/C）+ 中心评审日志（按 pack/case 聚合 D，case_id 经 --blind-map 映射回运行目录）
  4) 每个种子总分 = A+B+C+D；跨种子取 均值 ± 极差
  5) 写 leaderboard/verdicts/<model>.json（审计留档）并追加 leaderboard/scores.md
"""
from pathlib import Path
import sys, json, hashlib, argparse, datetime, statistics, subprocess

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import review_log
LEADERBOARD = ROOT / "leaderboard" / "scores.md"
VERDICTS = ROOT / "leaderboard" / "verdicts"

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--runs", nargs="*", default=None, help="要汇总的 run 目录；不填时从 blind-map 自动发现")
ap.add_argument("--seed-indexes", default=None, help="预注册序号，逗号分隔（推荐）")
ap.add_argument("--seeds", default=None, help="明文种子，逗号分隔（与 --seed-indexes 二选一）")
ap.add_argument("--d", default=None, help="每个种子一个 D，逗号分隔")
ap.add_argument("--review-log", default=None, help="中心化追加式评审日志 JSONL；提供后自动聚合 D")
ap.add_argument("--d-file", default=None, help="兼容旧盲评草稿 JSON")
ap.add_argument("--d-aggregate", choices=("mean", "median"), default="mean", help="从评审日志聚合 D 的方式")
ap.add_argument("--min-judges", type=int, default=1, help="每个 case 至少需要多少位评委")
ap.add_argument("--blind-map", action="append", default=None, help="盲评私有映射 JSON，可重复；不填时自动发现 leaderboard/verdicts/<模型>.*.blind-map.json")
ap.add_argument("--no-replay", action="store_true", help="跳过回放核验（不建议）")
ap.add_argument("--allow-partial", action="store_true", help="允许部分 run 尚无评分；汇总只使用已评分 run")
ap.add_argument("--dry-run", action="store_true", help="只打印，不写榜")
a = ap.parse_args()

if a.min_judges < 1:
    print("--min-judges 必须 >= 1")
    sys.exit(1)

map_args = a.blind_map or []
map_files = [Path(p).resolve() for p in map_args]
if not map_files:
    map_files = sorted(VERDICTS.glob(f"{a.model}.*.blind-map.json"))
    legacy = VERDICTS / f"{a.model}.blind-map.json"
    if legacy.exists():
        map_files.append(legacy)
map_files = list(dict.fromkeys(map_files))
blind_maps = []
run_to_case = {}
run_to_pack = {}
for mf in map_files:
    if not mf.exists():
        print(f"找不到盲评映射：{mf}")
        sys.exit(1)
    bm = json.loads(mf.read_text(encoding="utf-8"))
    if bm.get("model") and bm["model"] != a.model:
        print(f"盲评映射模型 {bm['model']} 与 --model {a.model} 不一致")
        sys.exit(1)
    pack_id = bm.get("pack_id")
    if not pack_id:
        print(f"映射缺少 pack_id：{mf}")
        sys.exit(1)
    for cid, meta in (bm.get("cases") or {}).items():
        run_name = meta.get("run")
        if not run_name:
            continue
        if run_name in run_to_case:
            print(f"run {run_name} 出现在多个映射中")
            sys.exit(1)
        run_to_case[run_name] = cid
        run_to_pack[run_name] = pack_id
    blind_maps.append(bm)

blind_pack_id = blind_maps[0].get("pack_id") if len(blind_maps) == 1 else None

if a.runs:
    runs = [Path(p).resolve() for p in a.runs]
elif run_to_case:
    runs = []
    for run_name in sorted(run_to_case):
        candidate = ROOT / "runs" / run_name
        if not candidate.exists():
            candidate = Path(run_name)
        runs.append(candidate.resolve())
else:
    print("必须给 --runs，或提供包含 run 的 --blind-map")
    sys.exit(1)

# ---- 种子 ----
if a.seed_indexes:
    import os
    idxs = [int(x) for x in a.seed_indexes.split(",")]
    seeds_file = Path(os.environ.get("SR_SEEDS") or (ROOT.parent / ".sr-seeds" / "seeds.json"))
    if not seeds_file.exists():
        print(f"找不到种子明文：{seeds_file}（由主控放置，或用环境变量 SR_SEEDS 指定）"); sys.exit(1)
    table = {s["index"]: s["seed"] for s in json.loads(seeds_file.read_text(encoding="utf-8"))["seeds"]}
    try:
        seeds = [table[i] for i in idxs]
    except KeyError as e:
        print(f"种子表里没有序号 {e}"); sys.exit(1)
elif a.seeds:
    seeds = [int(x) for x in a.seeds.split(",")]
else:
    import os
    seeds_file = Path(os.environ.get("SR_SEEDS") or (ROOT.parent / ".sr-seeds" / "seeds.json"))
    if not seeds_file.exists():
        print(f"找不到种子明文：{seeds_file}（由主控放置，或用环境变量 SR_SEEDS 指定）")
        sys.exit(1)
    table = json.loads(seeds_file.read_text(encoding="utf-8"))["seeds"]
    commit_to_seed = {hashlib.sha256(("sr:" + str(s["seed"])).encode()).hexdigest(): s["seed"] for s in table}
    seeds = []
    for run in runs:
        proto_path = run / "protocol.json"
        if not proto_path.exists():
            print(f"缺少 protocol.json，无法自动推断种子：{run}")
            sys.exit(1)
        proto = json.loads(proto_path.read_text(encoding="utf-8"))
        commit = (proto.get("scene") or {}).get("seed_commit")
        seed = commit_to_seed.get(commit)
        if seed is None:
            print(f"种子表里没有与 {run.name} 的承诺匹配的种子")
            sys.exit(1)
        seeds.append(seed)

# ---- 裁判分 ----
d_source = None
d_aggregate = None
d_counts = []
ds = []
case_ids = []
pack_ids = []
runs_total_all = len(runs)
if a.review_log:
    d_source = "review_log"
    d_aggregate = a.d_aggregate
    try:
        reviews = review_log.read_reviews(a.review_log)
    except review_log.ReviewLogError as e:
        print("读取评审日志失败：" + str(e))
        sys.exit(1)
    if not reviews:
        print("评审日志为空：" + str(Path(a.review_log).resolve()))
        sys.exit(1)
    used, duplicates = review_log.dedupe_latest(reviews)
    if duplicates:
        print(f"!! 评审日志有 {duplicates} 条重复/旧记录，已按 judge_id 保留最新一条")
    groups = review_log.aggregate_reviews(used, a.d_aggregate)
    by_key = {(g["pack_id"], g["case_id"]): g for g in groups}
    if not run_to_pack:
        print("--review-log 需要 --blind-map（或默认私有映射）来确定 pack_id")
        sys.exit(1)
    for r in runs:
        cid = run_to_case.get(r.name)
        pack_id = run_to_pack.get(r.name)
        if not cid or not pack_id:
            if a.allow_partial:
                print(f"!! {r.name} 不在任何映射中，跳过")
                ds.append(None); case_ids.append(None); pack_ids.append(None); d_counts.append(0)
                continue
            print(f"私有映射里没有 {r.name}")
            sys.exit(1)
        g = by_key.get((pack_id, cid))
        if not g or g["judge_count"] < a.min_judges:
            if a.allow_partial:
                print(f"!! {r.name} 尚无足够评分，跳过")
                ds.append(None); case_ids.append(cid); pack_ids.append(pack_id); d_counts.append(0)
                continue
            if not g:
                print(f"评审日志里没有 pack={pack_id} case={cid}（run={r.name}）")
            else:
                print(f"{r.name} 只有 {g['judge_count']} 位评委，少于 --min-judges {a.min_judges}")
            sys.exit(1)
        ds.append(g["D"])
        case_ids.append(cid)
        pack_ids.append(pack_id)
        d_counts.append(g["judge_count"])
elif a.d_file:
    d_source = "d_file"
    draft = json.loads(Path(a.d_file).read_text(encoding="utf-8"))
    draft_pack_id = draft.get("pack_id")
    if draft_pack_id and blind_pack_id and draft_pack_id != blind_pack_id:
        print(f"盲评草稿 pack_id={draft_pack_id} 与私有映射 pack_id={blind_pack_id} 不一致")
        sys.exit(1)
    draft_cases = draft.get("cases") or draft.get("seeds", [])
    by_run = {s.get("run"): s for s in draft_cases if s.get("run")}
    by_case = {s.get("case_id"): s for s in draft_cases if s.get("case_id")}
    for r in runs:
        cid = run_to_case.get(r.name)
        pack_id = run_to_pack.get(r.name)
        item = by_run.get(r.name) or (by_case.get(cid) if cid else None)
        if not item:
            if a.allow_partial:
                print(f"!! {r.name} 草稿里没有评分，跳过")
                ds.append(None); case_ids.append(cid); pack_ids.append(pack_id); d_counts.append(0)
                continue
            print(f"草稿里没有 {r.name}" + (f"（期望 case_id={cid}）" if cid else "；如果是盲评草稿，请给 --blind-map"))
            sys.exit(1)
        totals = []
        for j in item.get("judges", []):
            if all(isinstance(j.get(k), (int, float)) for k in ("D1", "D2", "D3")):
                if not (0 <= j["D1"] <= 11 and 0 <= j["D2"] <= 10 and 0 <= j["D3"] <= 9):
                    print(f"{r.name} 的 D 分超出范围：D1≤11 / D2≤10 / D3≤9")
                    sys.exit(1)
                totals.append(j["D1"] + j["D2"] + j["D3"])
        if not totals or len(totals) < a.min_judges:
            if a.allow_partial:
                print(f"!! {r.name} 尚无足够评分，跳过")
                ds.append(None); case_ids.append(item.get("case_id") or cid); pack_ids.append(pack_id); d_counts.append(len(totals))
                continue
            if not totals:
                print(f"{r.name} 的 D 还没填（D1/D2/D3）")
            else:
                print(f"{r.name} 只有 {len(totals)} 位有效评委，少于 --min-judges {a.min_judges}")
            sys.exit(1)
        ds.append(round(statistics.median(totals), 2))
        case_ids.append(item.get("case_id") or cid)
        pack_ids.append(pack_id)
        d_counts.append(len(totals))
elif a.d:
    d_source = "direct"
    ds = [float(x) for x in a.d.split(",")]
    case_ids = [None] * len(runs)
    pack_ids = [run_to_pack.get(r.name) for r in runs]
    d_counts = [None] * len(runs)
else:
    print("必须给 --review-log / --d-file / --d")
    sys.exit(1)

rounds_total_all = 0
for r0 in runs:
    try:
        rounds_total_all += int(json.loads((r0 / "result.json").read_text(encoding="utf-8")).get("rounds") or 0)
    except Exception:
        pass
judge_reviews_all = sum(x or 0 for x in d_counts)
scored_indices = [i for i, d in enumerate(ds) if d is not None]
if not scored_indices:
    print("没有可汇总的已评分 run")
    sys.exit(1)
runs = [runs[i] for i in scored_indices]
seeds = [seeds[i] for i in scored_indices]
ds = [ds[i] for i in scored_indices]
case_ids = [case_ids[i] for i in scored_indices]
pack_ids = [pack_ids[i] for i in scored_indices]
d_counts = [d_counts[i] for i in scored_indices]

if not (len(runs) == len(seeds) == len(ds)):
    print(f"--runs / 种子 / D 数量必须一致（现在 {len(runs)}/{len(seeds)}/{len(ds)}）"); sys.exit(1)

rows, errors = [], []
for run, seed, d, case_id, judge_count, pack_id in zip(runs, seeds, ds, case_ids, d_counts, pack_ids):
    name = run.name
    missing = [f for f in ("protocol.json", "result.json", "评分.json") if not (run / f).exists()]
    if missing:
        errors.append(f"{name}: 缺少 {', '.join(missing)}（先跑 score_run.py）"); continue

    proto = json.loads((run / "protocol.json").read_text(encoding="utf-8"))
    res = json.loads((run / "result.json").read_text(encoding="utf-8"))
    sc = json.loads((run / "评分.json").read_text(encoding="utf-8"))

    commit = (proto.get("scene") or {}).get("seed_commit")
    calc = hashlib.sha256(("sr:" + str(seed)).encode()).hexdigest()
    if calc != commit:
        errors.append(f"{name}: 种子承诺不匹配（给定 {seed}）"); continue

    replay_ok = None
    if not a.no_replay:
        r = subprocess.run(["node", str(ROOT / "tools" / "verify_replay.mjs"), str(run), "--seed", str(seed)],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        replay_ok = (r.returncode == 0)
        if not replay_ok:
            errors.append(f"{name}: 回放与结算不一致（成绩作废）"); continue

    A, B, C = sc.get("A_outcome"), sc.get("B_efficiency"), sc.get("C_quality")
    rows.append({
        "run": name, "pack_id": pack_id, "case_id": case_id, "judge_count": judge_count, "rounds": res.get("rounds"), "seed_commit": str(commit)[:12], "seed_verified": True, "replay_ok": replay_ok,
        "profit": round(float((res.get("score") or {}).get("totalProfit") or 0), 2),
        "completed": (res.get("score") or {}).get("completedOrders"),
        "endToEndMin": round(float(res.get("endToEndSeconds") or 0) / 60, 1),
        "A": A, "B": B, "C": C, "D": d, "total": round((A or 0) + (B or 0) + (C or 0) + d, 2),
    })

if errors:
    print("不能出榜：")
    for e in errors:
        print("  !! " + e)
    sys.exit(1)

def agg(key):
    vals = [r[key] for r in rows if isinstance(r[key], (int, float))]
    return (statistics.mean(vals), (max(vals) - min(vals)) / 2) if vals else (None, None)

lines = [f"\n### 最终成绩 · {a.model} — {datetime.datetime.now():%Y-%m-%d %H:%M}", "",
         "| 种子 | 净利 | 单数 | 端到端 | A(30) | B(15) | C(25) | D(30) | D评委 | 总分(100) | 承诺 | 回放 |",
         "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
for r in rows:
    lines.append(f"| {r['seed_commit']} | {r['profit']:.1f} | {r['completed']} | {r['endToEndMin']:.1f} 分 "
                 f"| {r['A']:.2f} | {r['B']:.2f} | {r['C']:.2f} | {r['D']:.2f} | {r['judge_count'] if r['judge_count'] is not None else '-'} | {r['total']:.2f} "
                 f"| {'✓' if r['seed_verified'] else '✗'} | {'✓' if r['replay_ok'] in (True, None) else '✗'} |")
mA, rA = agg("A"); mB, rB = agg("B"); mC, rC = agg("C")
mD, rD = agg("D"); mT, rT = agg("total"); mP, rP = agg("profit")
lines += ["",
          f"**均值 ± 极差**：净利 {mP:.1f} ±{rP:.1f}｜A {mA:.2f} ±{rA:.2f}｜B {mB:.2f} ±{rB:.2f}"
          f"｜C {mC:.2f} ±{rC:.2f}｜D {mD:.2f} ±{rD:.2f}｜**总分 {mT:.2f} ±{rT:.2f}**", "",
          f"- 模型汇总：运行 {runs_total_all} 次（已评分 {len(rows)} 次），评委记录 {judge_reviews_all} 条，累计模拟轮次 {rounds_total_all}。",
          f"- 本次汇总 run 数 {len(rows)}；A/B/C 由 `score_run.py` 计算，D 来源={d_source or 'd-file'}，聚合={d_aggregate or 'legacy-median'}。"]
text = "\n".join(lines)
print(text)

if a.dry_run:
    print("\n[dry-run] 未写入榜单与裁决文件。")
    sys.exit(0)

VERDICTS.mkdir(parents=True, exist_ok=True)
(VERDICTS / f"{a.model}.json").write_text(json.dumps({
    "model": a.model, "finalized_at": datetime.datetime.now().isoformat(timespec="seconds"),
    "blind_pack_id": blind_pack_id,
    "blind_pack_ids": sorted({r["pack_id"] for r in rows if r.get("pack_id")}),
    "review_log": a.review_log,
    "d_source": d_source,
    "d_aggregate": d_aggregate,
    "summary": {"runs_total": runs_total_all, "runs_scored": len(rows), "judge_reviews": judge_reviews_all, "rounds_total": rounds_total_all},
    "runs": rows,
    "mean": {"profit": mP, "A": mA, "B": mB, "C": mC, "D": mD, "total": mT},
    "range_half": {"profit": rP, "A": rA, "B": rB, "C": rC, "D": rD, "total": rT},
}, ensure_ascii=False, indent=1), encoding="utf-8")
with LEADERBOARD.open("a", encoding="utf-8") as f:
    f.write(text + "\n")
print(f"\n已写入：{LEADERBOARD.relative_to(ROOT)} 与 {VERDICTS.relative_to(ROOT)}/{a.model}.json")

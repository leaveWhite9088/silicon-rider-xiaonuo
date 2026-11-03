# -*- coding: utf-8 -*-
"""出榜：把 N 个种子的脚本分（A/B/C）与裁判 D 分合成总分，写入排行榜。

用法（推荐，种子用预注册序号，明文由脚本自己读，人不接触）：
    python src/scoring/finalize.py --model Demo \
        --runs runs/Demo-s1 runs/Demo-s2 runs/Demo-s3 \
        --seed-indexes 1,2,3 --d-file leaderboard/verdicts/Demo.draft.json

也可直接用明文/直接给分：
    ... --seeds 111,222,333 --d 21,22.5,23

可选：--no-replay（跳过回放核验，仅调试）、--dry-run（只打印不写榜）。

流程：
  1) 核对每个种子的承诺（sha256("sr:"+seed) == protocol.scene.seed_commit）
  2) 逐目录回放核验（tools/verify_replay.mjs），不一致直接拒绝出榜
  3) 读 评分.json（A/B/C）+ 裁判 D（草稿里每位裁判 D1+D2+D3，多种子取中位）
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
LEADERBOARD = ROOT / "leaderboard" / "scores.md"
VERDICTS = ROOT / "leaderboard" / "verdicts"

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--runs", nargs="+", required=True)
ap.add_argument("--seed-indexes", default=None, help="预注册序号，逗号分隔（推荐）")
ap.add_argument("--seeds", default=None, help="明文种子，逗号分隔（与 --seed-indexes 二选一）")
ap.add_argument("--d", default=None, help="每个种子一个 D，逗号分隔")
ap.add_argument("--d-file", default=None, help="裁判草稿 JSON（judge_pack.py 生成，填好 D1/D2/D3）")
ap.add_argument("--no-replay", action="store_true", help="跳过回放核验（不建议）")
ap.add_argument("--dry-run", action="store_true", help="只打印，不写榜")
a = ap.parse_args()

runs = [Path(p).resolve() for p in a.runs]

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
    print("必须给 --seed-indexes 或 --seeds"); sys.exit(1)

# ---- 裁判分 ----
if a.d_file:
    draft = json.loads(Path(a.d_file).read_text(encoding="utf-8"))
    by_run = {s["run"]: s for s in draft.get("seeds", [])}
    ds = []
    for r in runs:
        item = by_run.get(r.name)
        if not item:
            print(f"草稿里没有 {r.name}"); sys.exit(1)
        totals = []
        for j in item.get("judges", []):
            if all(isinstance(j.get(k), (int, float)) for k in ("D1", "D2", "D3")):
                totals.append(j["D1"] + j["D2"] + j["D3"])
        if not totals:
            print(f"{r.name} 的 D 还没填（D1/D2/D3）"); sys.exit(1)
        ds.append(round(statistics.median(totals), 2))
elif a.d:
    ds = [float(x) for x in a.d.split(",")]
else:
    print("必须给 --d 或 --d-file"); sys.exit(1)

if not (len(runs) == len(seeds) == len(ds)):
    print(f"--runs / 种子 / D 数量必须一致（现在 {len(runs)}/{len(seeds)}/{len(ds)}）"); sys.exit(1)

rows, errors = [], []
for run, seed, d in zip(runs, seeds, ds):
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
        "run": name, "seed_commit": str(commit)[:12], "seed_verified": True, "replay_ok": replay_ok,
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
         "| 种子 | 净利 | 单数 | 端到端 | A(30) | B(15) | C(25) | D(30) | 总分(100) | 承诺 | 回放 |",
         "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
for r in rows:
    lines.append(f"| {r['seed_commit']} | {r['profit']:.1f} | {r['completed']} | {r['endToEndMin']:.1f} 分 "
                 f"| {r['A']:.2f} | {r['B']:.2f} | {r['C']:.2f} | {r['D']:.2f} | {r['total']:.2f} "
                 f"| {'✓' if r['seed_verified'] else '✗'} | {'✓' if r['replay_ok'] in (True, None) else '✗'} |")
mA, rA = agg("A"); mB, rB = agg("B"); mC, rC = agg("C")
mD, rD = agg("D"); mT, rT = agg("total"); mP, rP = agg("profit")
lines += ["",
          f"**均值 ± 极差**：净利 {mP:.1f} ±{rP:.1f}｜A {mA:.2f} ±{rA:.2f}｜B {mB:.2f} ±{rB:.2f}"
          f"｜C {mC:.2f} ±{rC:.2f}｜D {mD:.2f} ±{rD:.2f}｜**总分 {mT:.2f} ±{rT:.2f}**", "",
          f"- 口径：`{(json.loads((runs[0] / 'protocol.json').read_text(encoding='utf-8')) or {}).get('version')}`；"
          f"种子数 {len(rows)}；A/B/C 由 `score_run.py` 计算，D 由裁判按事实卡给出（多位裁判取中位）。"]
text = "\n".join(lines)
print(text)

if a.dry_run:
    print("\n[dry-run] 未写入榜单与裁决文件。")
    sys.exit(0)

VERDICTS.mkdir(parents=True, exist_ok=True)
(VERDICTS / f"{a.model}.json").write_text(json.dumps({
    "model": a.model, "finalized_at": datetime.datetime.now().isoformat(timespec="seconds"),
    "runs": rows,
    "mean": {"profit": mP, "A": mA, "B": mB, "C": mC, "D": mD, "total": mT},
    "range_half": {"profit": rP, "A": rA, "B": rB, "C": rC, "D": rD, "total": rT},
}, ensure_ascii=False, indent=1), encoding="utf-8")
with LEADERBOARD.open("a", encoding="utf-8") as f:
    f.write(text + "\n")
print(f"\n已写入：{LEADERBOARD.relative_to(ROOT)} 与 {VERDICTS.relative_to(ROOT)}/{a.model}.json")

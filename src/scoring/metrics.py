# -*- coding: utf-8 -*-
"""A/B/C 指标 + 决策事实卡。

输入：runs/<名>/ 下的 trace.jsonl / result.json / protocol.json
输出（每个运行目录，由 score_run.py 调用）：
  factcard.md   决策事实卡（D 层唯一输入）
  评分.json     A/B/C 分与明细
批量：python -m metrics        → out/script_scores.json + out/factcards/*.md
"""
from pathlib import Path
import json, re, sys, hashlib

HERE = Path(__file__).resolve().parent          # src/scoring
ROOT = HERE.parent.parent                       # 仓库根
BASE = ROOT
WORKS_DIR = ROOT / "runs"                       # 每次运行一个子目录
OUT = ROOT / "out"
CONFIG_FILE = ROOT / "configs" / "benchmark.json"
QUERY_TOOLS = {"get_my_status", "search_nearby_orders", "search_nearby_battery_stations",
               "get_location_info", "calculate_distance", "estimate_time", "get_map", "help"}
ACTION_TOOLS = {"accept_order", "move_to", "pickup_food", "deliver_food", "swap_battery", "wait"}


# 计分常量：集中在 configs/benchmark.json → scoring；缺省值 = 默认锚 350 + 标准分档
SCORING = {}
try:
    if CONFIG_FILE.exists():
        SCORING = (json.loads(CONFIG_FILE.read_text(encoding="utf-8")) or {}).get("scoring", {}) or {}
except Exception:
    SCORING = {}
PROFIT_ANCHOR = float(SCORING.get("anchor_yuan", 350.0))   # A 的分母（换种子必须重标，见 tools/bounds.mjs）
A_MAX = float(SCORING.get("A_max", 30.0))
_B = SCORING.get("B", {}) or {}
B1_MAX = float(_B.get("b1_max", 5.0))
B2_MAX = float(_B.get("b2_max", 10.0))
B2_FREE = float(_B.get("b2_free_min", 8.0))
B2_HALF = float(_B.get("b2_halflife_min", 12.0))
_C = SCORING.get("C", {}) or {}
C1_MAX = float(_C.get("c1_max", 9.0))
C2_MAX = float(_C.get("c2_max", 8.0))
C3_MAX = float(_C.get("c3_max", 8.0))


def parse_trace(work: Path):
    tools, models_n, ticks, initial = [], [], [], None
    with (work / "trace.jsonl").open(encoding="utf-8", errors="replace") as f:
        for ln in f:
            ln = ln.strip()
            if not ln:
                continue
            try:
                o = json.loads(ln)
            except Exception:
                continue
            t = o.get("type")
            if t == "tool":
                tools.append(o)
            elif t == "model":
                models_n.append(o)
            elif t == "tick":
                ticks.append(o)
            elif t == "initial":
                initial = o
    return tools, models_n, ticks, initial


def analyze_work(work: Path):
    r = json.loads((work / "result.json").read_text(encoding="utf-8"))
    sc = r.get("score") or {}
    snap = r.get("snapshot") or {}
    proto = json.loads((work / "protocol.json").read_text(encoding="utf-8"))
    tools, model_lines, ticks, initial = parse_trace(work)

    m = {"profit": sc.get("totalProfit"), "onTimeRate": sc.get("onTimeRate"),
         "completed": sc.get("completedOrders"), "onTime": sc.get("onTimeOrders"),
         "pathEff": sc.get("pathEfficiency"), "totalDistance": sc.get("totalDistance"),
         "optimalDistance": sc.get("optimalDistance"), "penalty": sc.get("totalPenalty"),
         "revenue": sc.get("totalRevenue"), "avgOvertime": sc.get("averageOvertime"),
         "swaps": sc.get("batterySwaps"), "termination": r.get("termination"),
         "engine_invalid": sc.get("invalidToolCalls"), "engine_calls": sc.get("totalToolCalls"),
         "endMinute": snap.get("minute"), "remainingMin": snap.get("remainingMinutes"),
         "endBattery": snap.get("battery"), "carryingAtEnd": len(snap.get("orders") or []),
         "rounds": r.get("rounds"), "status": r.get("status")}

    # ---------- 无效调用（官方口径：失败 + 两次动作之间重复的同参数查询） ----------
    seen_q, last_action_round, failed, dups = {}, -10**9, [], []
    dup_detail = []
    first_accept_round = None
    for x in tools:
        c = x.get("call") or {}
        name, args = c.get("name"), json.dumps(c.get("arguments"), sort_keys=True, ensure_ascii=False)
        rd = x.get("round", 0)
        ok = bool((x.get("response") or {}).get("success"))
        if name == "accept_order" and ok and first_accept_round is None:
            first_accept_round = rd
        if not ok:
            err = ((x.get("response") or {}).get("error") or {})
            failed.append({"round": rd, "tool": name, "code": err.get("code"), "msg": err.get("message"),
                           "args": args[:120]})
        if name in QUERY_TOOLS:
            key = (name, args)
            if key in seen_q and seen_q[key] > last_action_round:
                dups.append({"round": rd, "tool": name, "prevRound": seen_q[key],
                             "phase": "预热" if (first_accept_round is None or rd <= first_accept_round) else "班中"})
            seen_q[key] = rd
        elif name in ACTION_TOOLS and x.get("executed", True) and ok:
            last_action_round = rd
    n_calls = len(tools)
    # 同一轮可能既失败又是重复查询：按“轮次”取并集，避免比率 > 1
    bad_rounds = {f["round"] for f in failed} | {d["round"] for d in dups}
    invalid_ratio = len(bad_rounds) / n_calls if n_calls else None
    m.update(calls=n_calls, failed=len(failed), repeated=len(dups), invalid_ratio=invalid_ratio,
             failed_detail=failed[:40], dup_examples=dups[:20])
    m["nQueries"] = sum(1 for x in tools if (x.get("call") or {}).get("name") in QUERY_TOOLS)
    m["nTicks"] = len(ticks)

    # ---------- 失败分类（状态一致性证据） ----------
    state_err = [f for f in failed if f["code"] in ("INVALID_ORDER", "ORDER_NOT_FOUND", "NOT_FOUND",
                                                   "ALREADY_DELIVERED", "NOT_PICKED_UP", "INVALID_STATE")]
    cap_err = [f for f in failed if f["code"] in ("OVERLOAD", "WEIGHT_LIMIT", "BATTERY_LOW", "NO_BATTERY")]
    m["state_errors"] = len(state_err)
    m["capacity_errors"] = len(cap_err)
    m["other_errors"] = len(failed) - len(state_err) - len(cap_err)

    # ---------- 电量管理 ----------
    swaps, min_battery, stall = [], 999.0, 0
    for x in tools:
        b, a = x.get("before") or {}, x.get("after") or {}
        bt = b.get("battery")
        if isinstance(bt, (int, float)):
            min_battery = min(min_battery, bt)
            if bt <= 0.01:
                stall += 1
        if (x.get("call") or {}).get("name") == "swap_battery":
            swaps.append({"round": x.get("round"), "minute": b.get("minute"), "batteryBefore": b.get("battery"),
                          "batteryAfter": a.get("battery")})
    m.update(swap_events=swaps, min_battery=None if min_battery == 999.0 else round(min_battery, 1),
             battery_stalls=stall)

    # ---------- 空驶与批量 ----------
    dist_total = dist_empty = 0.0
    loaded_moves = empty_moves = 0
    carry_len_hist = {}
    for x in tools:
        if (x.get("call") or {}).get("name") == "move_to" and x.get("executed"):
            b, a = x.get("before") or {}, x.get("after") or {}
            d = (a.get("distance") or 0) - (b.get("distance") or 0)
            if d > 0.01:
                carrying = len(b.get("orders") or [])
                carry_len_hist[carrying] = carry_len_hist.get(carrying, 0) + 1
                dist_total += d
                if b.get("weight", 0) > 0.001:
                    loaded_moves += 1
                else:
                    empty_moves += 1
                    dist_empty += d
    m.update(emptyDistance=round(dist_empty, 2), emptyRatio=round(dist_empty / dist_total, 3) if dist_total else None,
             loadedMoves=loaded_moves, emptyMoves=empty_moves, carryHist=carry_len_hist)

    # ---------- 接单决策分析（用 accept 前快照的 availableOrders 全集） ----------
    accepts = []
    for x in tools:
        c = x.get("call") or {}
        if c.get("name") != "accept_order":
            continue
        b = x.get("before") or {}
        oid = (c.get("arguments") or {}).get("orderId")
        ok = bool((x.get("response") or {}).get("success"))
        open_orders = b.get("availableOrders") or []
        chosen = next((o for o in open_orders if o.get("id") == oid), None)
        alts = []
        for o in open_orders:
            if o.get("id") == oid:
                continue
            alts.append({"id": o["id"], "fee": round(o["deliveryFee"], 2), "dist": round(o["distance"], 2),
                         "timeLimit": round(o.get("timeLimit", 0), 1),
                          "feePerKm": round(o["deliveryFee"] / o["distance"], 2) if o.get("distance") else None})
        entry = {"round": x.get("round"), "minute": round(b.get("minute", 0), 1), "orderId": oid,
                 "success": ok, "openOrders": len(open_orders)}
        if chosen:
            entry.update(fee=round(chosen["deliveryFee"], 2), dist=round(chosen["distance"], 2),
                         timeLimit=round(chosen.get("timeLimit", 0), 1),
                         battery=round(b.get("battery", 0), 1), carrying=len(b.get("orders") or []),
                         weight=round(b.get("weight", 0), 2))
            if chosen.get("distance"):
                entry["feePerKm"] = round(chosen["deliveryFee"] / chosen["distance"], 2)
            # D1 主指标：单位时间收入（不含接驾，属于下界），不随池子大小漂移
            entry["feePerMinute"] = round(chosen["deliveryFee"] / (2 * chosen["distance"] + 3), 3)
            entry["poolSize"] = len(open_orders)
            if alts:
                by_fee = sorted([a["fee"] for a in alts], reverse=True)
                entry["feeRank"] = sum(1 for f in by_fee if f > entry["fee"]) + 1
                entry["feePool"] = len(by_fee) + 1
                entry["feePercentile"] = round(1 - (entry["feeRank"] - 1) / len(by_fee), 2)
                best = max(alts, key=lambda a: (a["fee"] or 0))
                entry["bestAltFee"] = best["fee"]; entry["bestAltId"] = best["id"]
                fpk = [a["feePerKm"] for a in alts if a.get("feePerKm") is not None]
                if entry.get("feePerKm") is not None and fpk:
                    entry["feePerKmRank"] = sum(1 for f in fpk if f > entry["feePerKm"]) + 1
                    entry["feePerKmPool"] = len(fpk) + 1
                    entry["feePerKmPercentile"] = round(1 - (entry["feePerKmRank"] - 1) / len(fpk), 2)
        else:
            entry["note"] = "订单不在接单时可见集合中(过期或不存在)" if not ok else "可见集合中未找到(引擎数据缺)"
        accepts.append(entry)
    succ = [a for a in accepts if a.get("feePercentile") is not None]
    n_ok = sum(1 for a in accepts if a["success"])
    m.update(acceptEvents=accepts, nAccepts=len(accepts), nAcceptOK=n_ok,
             meanFeePct=None if not succ else round(sum(a["feePercentile"] for a in succ) / len(succ), 3),
             accept_detail=accepts)
    m["queriesPerAccept"] = (round(m["nQueries"] / n_ok, 2) if n_ok else None)

    # ---------- 批量/顺路：deliver 时携带数 & pickup 前接单数 ----------
    delivers = []
    for x in tools:
        if (x.get("call") or {}).get("name") == "deliver_food":
            b = x.get("before") or {}
            ok = bool((x.get("response") or {}).get("success"))
            delivers.append({"round": x.get("round"), "minute": round(b.get("minute", 0), 1),
                             "orderId": (x.get("call") or {}).get("arguments", {}).get("orderId"),
                             "carrying": len(b.get("orders") or []), "success": ok})
    multi = [d for d in delivers if d["carrying"] >= 2]
    m.update(deliverEvents=delivers, multiDeliveries=len(multi),
             batchRate=None if not delivers else round(len(multi) / len(delivers), 3))

    # ---------- 订单生命周期：死单 / 服务时长 vs 估计时限 / 幽灵链 ----------
    accept_ok = {}   # orderId -> {minute, round, timeLimit}
    delivered = {}   # orderId -> deliver minute
    picked = set()
    for x in tools:
        c = x.get("call") or {}
        name = c.get("name")
        args = c.get("arguments") or {}
        ok = bool((x.get("response") or {}).get("success"))
        oid = args.get("orderId")
        b = x.get("before") or {}
        if name == "accept_order" and ok and oid:
            tl = None
            for o in (b.get("availableOrders") or []):
                if o.get("id") == oid:
                    tl = o.get("timeLimit")
                    break
            accept_ok[oid] = {"minute": b.get("minute"), "round": x.get("round"), "timeLimit": tl}
        elif name == "pickup_food" and ok and oid:
            picked.add(oid)
        elif name == "deliver_food" and ok and oid:
            delivered[oid] = b.get("minute")
    end_carried = {o.get("id") if isinstance(o, dict) else o for o in (snap.get("orders") or [])}
    dead, slow, end_detail = [], [], []
    for oid, acc in accept_ok.items():
        if oid in delivered:
            dur = None if (delivered[oid] is None or acc["minute"] is None) else delivered[oid] - acc["minute"]
            tl = acc.get("timeLimit")
            slow.append({"orderId": oid, "duration": round(dur, 1) if dur is not None else None, "timeLimit": tl,
                         "over": None if (dur is None or tl is None) else round(dur - tl, 1)})
            continue
        carried = None if (acc["minute"] is None or m.get("endMinute") is None) else m["endMinute"] - acc["minute"]
        entry = {"orderId": oid, "acceptMinute": acc["minute"], "picked": oid in picked,
                 "carriedMinutes": None if carried is None else round(carried, 1),
                 "inEndSnapshot": oid in end_carried}
        (dead if not entry["picked"] else end_detail).append(entry)
    dead = sorted(dead, key=lambda e: -(e["carriedMinutes"] or 0))
    slow = [s_ for s_ in slow if s_["over"] is not None and s_["over"] > 0]
    slow.sort(key=lambda e: -e["over"])
    # 幽灵链：accept 失败后仍对同一订单 pickup/deliver
    ghost_chain = {}
    for i, x in enumerate(tools):
        c = x.get("call") or {}
        if c.get("name") == "accept_order" and not bool((x.get("response") or {}).get("success")):
            oid = (c.get("arguments") or {}).get("orderId")
            n = sum(1 for y in tools[i + 1:]
                    if (y.get("call") or {}).get("name") in ("pickup_food", "deliver_food")
                    and (y.get("call") or {}).get("arguments", {}).get("orderId") == oid)
            if n:
                ghost_chain[oid] = n
    m.update(deadOrders=dead, slowOrders=slow[:8], endCarriedDetail=end_detail,
             nDead=len(dead), nSlow=len(slow), ghostChain=ghost_chain,
             maxCarriedMinutes=max([e["carriedMinutes"] or 0 for e in dead], default=0))

    # ---------- 耗时（新口径：端到端优先） ----------
    wall = r.get("wallSeconds")
    if not wall:
        wall = proto.get("wall_seconds")
    timing = proto.get("timing") or {}
    e2e = r.get("endToEndSeconds")
    if e2e is None:
        e2e = timing.get("end_to_end_seconds")
    m["wallSeconds"] = wall
    m["endToEndSeconds"] = e2e
    m["b2Seconds"] = e2e if e2e else wall
    m["b2Basis"] = "end_to_end" if e2e else "driver_wall"
    m["t0Source"] = (proto.get("timing") or {}).get("t0_source") or r.get("t0Source")
    m["wallCapped"] = bool(wall and wall >= 1800)
    # ---------- 供给与时钟口径 ----------
    m["arrivalMode"] = (proto.get("arrival") or {}).get("mode")
    m["arrivalBatches"] = r.get("arrivalBatches") or (proto.get("arrival") or {}).get("batches")
    m["seedCommit"] = (proto.get("scene") or {}).get("seed_commit") or r.get("seedCommit")
    m["overrun"] = bool(r.get("overrun")) or bool((snap.get("minute") or 0) > 840.001)
    m["rejectedCalls"] = r.get("rejected", 0)
    # ---------- 调用节奏（脚本代打证据：相邻调用的中位间隔） ----------
    ts = [x.get("t") for x in tools if isinstance(x.get("t"), (int, float))]
    gaps = sorted(b - a for a, b in zip(ts, ts[1:]) if b >= a)
    m["medianCallGapMs"] = round(gaps[len(gaps) // 2], 1) if gaps else None
    m["suspectScript"] = bool(gaps and gaps[len(gaps) // 2] < 300)

    # ---------- 结束行为 ----------
    m["earlyQuit"] = m["termination"] == "model_stopped_early"
    return m


# ---------------- 客观分 ----------------
def level_from_invalid(ratio):
    """官方 6.1 档位：1%内9级、2%内8、3%内7、5%内6、7%内5、10%内4、15%内3、更多2。"""
    if ratio is None:
        return None
    for th, lv in ((0.01, 9), (0.02, 8), (0.03, 7), (0.05, 6), (0.07, 5), (0.10, 4), (0.15, 3)):
        if ratio <= th:
            return lv
    return 2


def score_work(m):
    s = {}
    # A 任务成果 30 = 30×净利/350（专家可达上限锚），截断 [0,30]；打穿锚=人工复核信号
    if m["profit"] is None:
        s["A_outcome"] = None
    else:
        a_raw = A_MAX * m["profit"] / PROFIT_ANCHOR
        s["A_outcome"] = round(max(0.0, min(A_MAX, a_raw)), 2)
        s["A_out_of_range"] = a_raw > A_MAX
    outcome_level = None if s["A_outcome"] is None else round(s["A_outcome"] / (A_MAX / 10))  # 30 分制 -> 0-10 级
    # B 执行效率 15（无效 5 + 耗时 10，各点分别以 满分×成果/31 为上限）
    outcome31 = None if s["A_outcome"] is None else s["A_outcome"] * 31 / A_MAX
    lv_inv = level_from_invalid(m["invalid_ratio"])
    b1 = None if lv_inv is None else round(B1_MAX * lv_inv / 10, 2)
    b2 = None
    b2sec = m.get("b2Seconds") or m.get("wallSeconds")
    if b2sec:
        minutes = b2sec / 60
        b2 = round(B2_MAX * (0.5 ** (max(0.0, minutes - B2_FREE) / B2_HALF)), 2)
    if outcome31 is not None:
        if b1 is not None:
            b1 = round(min(b1, B1_MAX * outcome31 / 31), 2)
        if b2 is not None:
            b2 = round(min(b2, B2_MAX * outcome31 / 31), 2)
    b_raw = None if (b1 is None or b2 is None) else round(b1 + b2, 2)
    s["B_efficiency"] = b_raw
    s["B_detail"] = {"B1_invalid5": b1, "B2_time10": b2, "cap31": None if outcome31 is None else round(outcome31, 2)}
    # C 操作质量 25（C1 约束 9 + C2 状态 8 + C3 路径 8）
    s["C1_constraint9"] = c1_level(m) * C1_MAX / 10
    s["C2_state8"] = c2_level(m) * C2_MAX / 10
    s["C3_path8"] = c3_level(m) * C3_MAX / 10
    s["C_quality"] = round(s["C1_constraint9"] + s["C2_state8"] + s["C3_path8"], 2)
    s["C_levels"] = {"C1": c1_level(m), "C2": c2_level(m), "C3": c3_level(m)}
    s["D_judged"] = None  # 裁判层待填
    s["total_v2_partial"] = (None if s["A_outcome"] is None or s["B_efficiency"] is None
                             else round(s["A_outcome"] + s["B_efficiency"] + s["C_quality"], 2))
    return s


def c1_level(m):
    """C1 约束与可靠性（0-10）：准时率为主，超时/罚款/电量停摆修正。"""
    otr = m.get("onTimeRate")
    if otr is None or not m.get("completed"):
        return 1 if (m.get("completed") or 0) > 0 else 0
    if otr >= 0.95:
        lv = 9
    elif otr >= 0.9:
        lv = 8
    elif otr >= 0.8:
        lv = 7
    elif otr >= 0.7:
        lv = 6
    elif otr >= 0.6:
        lv = 5
    elif otr >= 0.4:
        lv = 4
    elif otr >= 0.25:
        lv = 3
    else:
        lv = 2
    if (m.get("penalty") or 0) > 15:
        lv -= 1
    if m.get("battery_stalls"):
        lv -= 2
    return max(0, min(9, lv))


def c2_level(m):
    """C2 状态一致性（0-10）：对不存在/过期订单操作等状态错误。"""
    se = m.get("state_errors", 0)
    calls = max(1, m.get("calls", 1))
    rate = se / calls
    if se == 0:
        return 9
    if se <= 1 and rate <= 0.01:
        return 8
    if se <= 2:
        return 7
    if se <= 4:
        return 6
    if se <= 8:
        return 5
    if se <= 15:
        return 4
    return 3


def c3_level(m):
    """C3 路径质量（0-10）：引擎 pathEfficiency + 空驶率修正。

    阈值按真实轨迹重新标定（合单后该比值天然 < 1，旧阈值 1.10 会让"只要合单就满级"）：
      0.75 以下=9（优秀合单）　0.90=8　1.05=7　1.20=6　1.45=5（不合单约 1.3–1.5）
    参考标定：合单良好的班次 0.70–0.95；单跑一单单的班次 1.34–1.50。
    """
    pe = m.get("pathEff")
    if pe is None:
        return None
    if pe <= 0.75:
        lv = 9
    elif pe <= 0.90:
        lv = 8
    elif pe <= 1.05:
        lv = 7
    elif pe <= 1.20:
        lv = 6
    elif pe <= 1.45:
        lv = 5
    elif pe <= 1.80:
        lv = 4
    elif pe <= 2.40:
        lv = 3
    elif pe <= 3.50:
        lv = 2
    else:
        lv = 1
    er = m.get("emptyRatio")
    if er is not None:
        if er > 0.45:
            lv -= 1
        elif er < 0.15:
            lv = min(9, lv + 1)
    return max(0, min(9, lv))


# ---------------- 事实卡 ----------------
def fmt_time(minute):
    """引擎快照的 minute 已是绝对班次时刻（360=06:00 起，840=14:00 收班）。"""
    if minute is None:
        return "?"
    return f"{int(minute//60):02d}:{int(minute%60):02d}"


def factcard(aid, name_hidden, m):
    L = []
    L.append(f"# 决策事实卡 {aid}")
    L.append("")
    L.append("## 班次总览")
    L.append(f"- 结束方式：{m['termination']}；结束时刻 {fmt_time(m.get('endMinute'))}（班次 06:00–14:00），剩余 {None if m.get('remainingMin') is None else round(m['remainingMin'],1)} 分钟，结束时在途订单 {m.get('carryingAtEnd')} 单，电量 {None if m.get('endBattery') is None else round(m['endBattery'],1)}%")
    L.append(f"- 成绩：完成 {m.get('completed')} 单（准时 {m.get('onTime')}，准时率 {None if m.get('onTimeRate') is None else round(m['onTimeRate'],3)}），平均超时 {None if m.get('avgOvertime') is None else round(m['avgOvertime'],2)} 分钟，收工时在途未送 {m.get('carryingAtEnd')} 单")
    L.append(f"- 口径：新单生成={m.get('arrivalMode')}（{m.get('arrivalBatches')} 批）；B2 计时={m.get('b2Basis')}（端到端 {round((m.get('endToEndSeconds') or 0)/60,1)} 分钟 / 驱动 {(m.get('wallSeconds') or 0)/60:.1f} 分钟）；t0 来源={m.get('t0Source')}；种子承诺 {str(m.get('seedCommit'))[:12]}…；越线={m.get('overrun')}；被拒调用={m.get('rejectedCalls')}")
    L.append(f"- 行动量：工具调用 {m.get('calls')} 次（失败 {m.get('failed')}，其中状态类 {m.get('state_errors')}、容量类 {m.get('capacity_errors')}、其他 {m.get('other_errors')}；动作间同参数重复查询 {m.get('repeated')}），接单 {m.get('nAccepts')} 次（成功 {m.get('nAcceptOK')}），换电 {m.get('swaps')} 次，最低电量 {m.get('min_battery')}%")
    L.append(f"- 调用节奏：中位调用间隔 {m.get('medianCallGapMs')} ms" + ("（<300ms，疑似脚本代打）" if m.get('suspectScript') else ""))
    L.append(f"- 节奏：班中新单到达 {m.get('nTicks')} 波；查询类调用 {m.get('nQueries')} 次，平均每次成功接单前有 {m.get('queriesPerAccept')} 次查询")
    L.append(f"- 路线：总行驶 {None if m.get('totalDistance') is None else round(m['totalDistance'],1)}，同批任务理论最优 {None if m.get('optimalDistance') is None else round(m['optimalDistance'],1)}（路径效率 {None if m.get('pathEff') is None else round(m['pathEff'],2)}），空驶距离占比 {None if m.get('emptyRatio') is None else round(m['emptyRatio'],3)}，多单同送交付占比 {m.get('batchRate')}（送单 {len(m.get('deliverEvents') or [])} 次，其中携带≥2单 {m.get('multiDeliveries')} 次）")
    L.append(f"- 订单履约：接单后整班从未处理（死单）{m.get('nDead')} 单" + (f"，最长挂单 {m.get('maxCarriedMinutes')} 分钟" if m.get('nDead') else "") + f"；接单→送达超出引擎估计时限 {m.get('nSlow')} 单" + (f"（最大超出 {m['slowOrders'][0]['over']} 分钟）" if m.get('nSlow') else "") + f"；收工时在途未送 {m.get('carryingAtEnd')} 单")
    L.append("")
    L.append("## 接单决策明细（E行：每行一次接单）")
    for i, a in enumerate(m.get("acceptEvents") or [], 1):
        if not a["success"]:
            L.append(f"[E{i:02d}] {fmt_time(a.get('minute'))} 接单失败：{a.get('orderId')} —— {a.get('note') or '调用失败'}（当时在库订单 {a.get('openOrders')} 单）")
            continue
        L.append(f"[E{i:02d}] {fmt_time(a.get('minute'))} 接 {a.get('orderId')}：配送费 {a.get('fee')}，取送距离 {a.get('dist')}（单位距离费用 {a.get('feePerKm')}，在库第 {a.get('feePerKmRank')} 高/共 {a.get('feePerKmPool')}），**单位时间收入 {a.get('feePerMinute')} 元/分**，引擎估计时限 {a.get('timeLimit')} 分钟，当时在库订单 {a.get('openOrders')} 单；该单费用为在库第 {a.get('feeRank')} 高（共 {a.get('feePool')} 单可选，最高费 {a.get('bestAltId')} = {a.get('bestAltFee')}）；接单时已携带 {a.get('carrying')} 单/重 {a.get('weight')}，电量 {a.get('battery')}%")
    L.append("")
    L.append("## 送单与电量事件（F行）")
    ev = []
    for d in (m.get("deliverEvents") or []):
        tag = "多单同送" if d["carrying"] >= 2 else ("送单失败" if not d["success"] else "送单")
        ev.append(f"{fmt_time(d.get('minute'))} {tag}（携带 {d['carrying']} 单）" + ("" if d["success"] else ""))
    for s_ in (m.get("swap_events") or []):
        ev.append(f"{fmt_time(s_.get('minute'))} 换电（电量 {None if s_.get('batteryBefore') is None else round(s_['batteryBefore'],1)}% → {None if s_.get('batteryAfter') is None else round(s_['batteryAfter'],1)}%）")
    for i, e in enumerate(ev, 1):
        L.append(f"[F{i:02d}] {e}")
    if m.get("failed_detail"):
        L.append("")
        L.append("## 失败调用明细（G行）")
        for i, f_ in enumerate(m["failed_detail"], 1):
            ghost = (m.get("ghostChain") or {})
            oid = json.loads(f_["args"]).get("orderId") if f_["args"].startswith("{") else None
            extra = f"；失败后仍对该单行动 {ghost.get(oid)} 次" if oid and ghost.get(oid) else ""
            L.append(f"[G{i:02d}] round{f_['round']} {f_['tool']} {f_['args']} → {f_['code']}: {f_['msg']}{extra}")
    if m.get("deadOrders") or m.get("slowOrders") or m.get("endCarriedDetail"):
        L.append("")
        L.append("## 履约异常（I行，主控逐单核对）")
        i = 1
        for e in (m.get("deadOrders") or []):
            L.append(f"[I{i:02d}] 死单：{e['orderId']} 于 {fmt_time(e.get('acceptMinute'))} 接单，{'接单后从未取货' if not e['picked'] else '取货后从未送达'}，至收班挂单 {e['carriedMinutes']} 分钟" + ("，收班时仍在名下" if e.get("inEndSnapshot") else ""))
            i += 1
        for e in (m.get("slowOrders") or []):
            L.append(f"[I{i:02d}] 滞留：{e['orderId']} 接单→送达用时 {e['duration']} 分钟，超出引擎估计时限 {e['timeLimit']} 分钟（超 {e['over']} 分钟）")
            i += 1
        for e in (m.get("endCarriedDetail") or []):
            L.append(f"[I{i:02d}] 收班在途：{e['orderId']} {fmt_time(e.get('acceptMinute'))} 接单，{'已取货未送' if e['picked'] else '未取货'}，挂单 {e['carriedMinutes']} 分钟至收班")
            i += 1
    if m.get("dup_examples"):
        L.append("")
        L.append("## 重复查询（H行，预热=首次成功接单前的摸索期）")
        for i, d in enumerate(m["dup_examples"], 1):
            L.append(f"[H{i:02d}] round{d['round']} 重复 {d['tool']}（上次同参数在 round{d['prevRound']}，期间无新动作；{d.get('phase', '')}期）")
    L.append("")
    L.append("## 决策统计摘要")
    succ = [a for a in (m.get("acceptEvents") or []) if a.get("feePercentile") is not None]
    if succ:
        top = sum(1 for a in succ if a["feePercentile"] >= 0.6)
        bot = sum(1 for a in succ if a["feePercentile"] < 0.3)
        fpk = [a for a in succ if a.get("feePerKmPercentile") is not None]
        fpm = sorted(a["feePerMinute"] for a in succ if a.get("feePerMinute") is not None)
        L.append(f"- 有对照的成功接单 {len(succ)} 次：选单费用位于在库订单前 40% 的 {top} 次、后 30% 的 {bot} 次；平均费用分位 {m.get('meanFeePct')}")
        L.append("- 注意：费用分位以“当时在库集合”为分母，池子越大同样的单分位越低（会随时间漂移），**D1 主看下面两条绝对指标**")
        if fpm:
            med = fpm[len(fpm) // 2]
            L.append(f"- **单位时间收入 fee/(2d+3)**：中位 {med:.2f} 元/分、均值 {sum(fpm) / len(fpm):.2f} 元/分（不含接驾，属保守下界；与池子大小无关）")
        if fpk:
            mfpk = round(sum(a["feePerKmPercentile"] for a in fpk) / len(fpk), 3)
            L.append(f"- 单位距离费用视角：平均分位 {mfpk}（高 = 短单单价好）；其中费用分位低但单位距离费用分位高（≥0.6）的 {sum(1 for a in fpk if a['feePercentile'] < 0.4 and a['feePerKmPercentile'] >= 0.6)} 次——这类是'低价短单'，需结合距离解读")
        best_gap = sum((a.get("bestAltFee") or 0) - a["fee"] for a in succ if (a.get("bestAltFee") or 0) > a["fee"])
        L.append(f"- 相对『每次都选当时最高费单』少赚的机会成本合计约 {round(best_gap,1)}（未计路线/电量约束，仅供参考）")
    L.append(f"- 电量事件：换电 {m.get('swaps')} 次，最低电量 {m.get('min_battery')}%，停摆 {m.get('battery_stalls')} 次")
    L.append(f"- 班次结束：{'提前收工' if m.get('earlyQuit') else '跑满全班'}，收工时剩余 {None if m.get('remainingMin') is None else round(m.get('remainingMin'),1)} 分钟，在途未送 {m.get('carryingAtEnd')} 单")
    return "\n".join(L)


def main():
    """新赛制入口：扫描 runs/ 下每个运行目录，写出 script_scores.json 与事实卡。"""
    only = None
    if len(sys.argv) > 2 and sys.argv[1] == "--only":
        only = set(sys.argv[2].split(","))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "factcards").mkdir(exist_ok=True)
    names = sorted(p for p in WORKS_DIR.iterdir() if p.is_dir()) if WORKS_DIR.exists() else []
    if only:
        names = [p for p in names if p.name in only]
    scores, cards = {}, {}
    for p in names:
        try:
            m = analyze_work(p)
        except Exception as e:
            scores[p.name] = {"error": repr(e)}
            continue
        scores[p.name] = score_work(m)
        cards[p.name] = factcard(p.name, p.name, m)
    (OUT / "script_scores.json").write_text(json.dumps(scores, ensure_ascii=False, indent=1), encoding="utf-8")
    for name, card in cards.items():
        (OUT / "factcards" / f"{name}.md").write_text(card, encoding="utf-8")
    print(f"runs={len(scores)} cards={len(cards)} anchor={PROFIT_ANCHOR}")
    for n, s in scores.items():
        if "error" in s:
            print(f"  {n}: ERROR {s['error']}")
        else:
            print(f"  {n}: A={s['A_outcome']} B={s['B_efficiency']} C={s['C_quality']} 小计={s['total_v2_partial']}")


if __name__ == "__main__":
    main()


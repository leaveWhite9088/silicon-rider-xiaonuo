# -*- coding: utf-8 -*-
"""Scoring unit checks that do not need a full simulation run."""
import sys, unittest, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src" / "scoring"))
import metrics
import model_identity
import review_log


class C2ErrorCodeTests(unittest.TestCase):
    def test_engine_state_codes_are_counted(self):
        failed = [{"code": c} for c in (
            "ORDER_NOT_CARRIED", "WRONG_LOCATION", "NOT_AT_SWAP_STATION",
            "ORDER_NOT_PICKED_UP", "INVALID_ORDER",
        )]
        state, cap = metrics.classify_failed_calls(failed)
        self.assertEqual(len(state), 5)
        self.assertEqual(len(cap), 0)

    def test_capacity_codes_are_not_state_errors(self):
        failed = [{"code": c} for c in ("CAPACITY_EXCEEDED", "WEIGHT_EXCEEDED", "INVALID_PARAMETER")]
        state, cap = metrics.classify_failed_calls(failed)
        self.assertEqual(len(state), 0)
        self.assertEqual(len(cap), 2)


class C3Tests(unittest.TestCase):
    def test_c3_uses_path_efficiency_only(self):
        self.assertAlmostEqual(metrics.c3_level({"pathEff": 1.0, "emptyRatio": 0.9}),
                               metrics.c3_level({"pathEff": 1.0, "emptyRatio": 0.01}))
        self.assertAlmostEqual(metrics.c3_level({"pathEff": 1.05}), 7)     # 原档位节点
        self.assertAlmostEqual(metrics.c3_level({"pathEff": 1.45}), 5)

    def test_c3_is_continuous_and_monotone(self):
        xs = [0.5 + 0.01 * i for i in range(0, 500)]
        ys = [metrics.c3_level({"pathEff": x}) for x in xs]
        self.assertTrue(all(a >= b for a, b in zip(ys, ys[1:])))
        self.assertLess(max(a - b for a, b in zip(ys, ys[1:])), 0.1)       # 没有跨阈值的整级跳变


class ContinuousScoringTests(unittest.TestCase):
    def test_b1_nodes_and_one_call_is_small(self):
        self.assertAlmostEqual(metrics.level_from_invalid(0.0), 10)
        self.assertAlmostEqual(metrics.level_from_invalid(0.02), 8)
        # 120 次调用里多错 1 次：原来可能直接掉一整级，现在只掉约 0.8 级以内
        self.assertLess(metrics.level_from_invalid(0) - metrics.level_from_invalid(1 / 120), 1.0)

    def test_c1_late_order_loses_proportionally(self):
        full = {"onTimeRate": 1.0, "completed": 15, "penalty": 0}
        one_late = {"onTimeRate": 14 / 15, "completed": 15, "penalty": 0}
        two_late = {"onTimeRate": 13 / 15, "completed": 15, "penalty": 0}
        l0, l1, l2 = (metrics.c1_level(x) for x in (full, one_late, two_late))
        self.assertAlmostEqual(l0, 10)
        self.assertTrue(l0 > l1 > l2)
        self.assertAlmostEqual(l0 - l1, l1 - l2, delta=0.7)                # 逐单递减，不是第一单掉一级、第二单几乎不掉

    def test_c1_penalty_and_stall(self):
        base = {"onTimeRate": 1.0, "completed": 15}
        self.assertAlmostEqual(metrics.c1_level(dict(base, penalty=15)), 9)  # 15 元 = 原来的 -1 级
        self.assertAlmostEqual(metrics.c1_level(dict(base, battery_stalls=1)), 8)

    def test_c2_counts(self):
        self.assertAlmostEqual(metrics.c2_level({"state_errors": 0}), 10)
        self.assertAlmostEqual(metrics.c2_level({"state_errors": 1}), 9)
        self.assertLess(metrics.c2_level({"state_errors": 3}), metrics.c2_level({"state_errors": 2}))
        self.assertAlmostEqual(metrics.c2_level({"state_errors": 99}), 3)



class BCapTests(unittest.TestCase):
    def m(self, profit, invalid=0.0, seconds=300):
        return {"profit": profit, "invalid_ratio": invalid, "b2Seconds": seconds,
                "onTimeRate": 1.0, "completed": 15, "penalty": 0, "state_errors": 0, "pathEff": 0.8}

    def test_cap_only_binds_when_outcome_is_low(self):
        anchor = metrics.PROFIT_ANCHOR
        mid = metrics.score_work(self.m(anchor * 0.7))          # A=21，高于 A_max×0.5：不封顶
        self.assertEqual(mid["B_detail"]["cap_frac"], 1.0)
        self.assertEqual(mid["B_detail"]["B1_invalid5"], metrics.B1_MAX)
        self.assertEqual(mid["B_detail"]["B2_time10"], metrics.B2_MAX)
        low = metrics.score_work(self.m(anchor * 0.1))          # A=3：封顶到 A/(0.5*A_max)=0.2
        self.assertAlmostEqual(low["B_detail"]["cap_frac"], 0.2, places=3)
        self.assertAlmostEqual(low["B_detail"]["B1_invalid5"], metrics.B1_MAX * 0.2, places=2)
        self.assertAlmostEqual(low["B_detail"]["B2_time10"], metrics.B2_MAX * 0.2, places=2)

    def test_zero_profit_gets_no_b(self):
        z = metrics.score_work(self.m(0.0))
        self.assertEqual(z["B_detail"]["B1_invalid5"], 0)
        self.assertEqual(z["B_detail"]["B2_time10"], 0)


class ModelIdentityTests(unittest.TestCase):
    def test_numbered_batch_suffixes_merge(self):
        base = "deepseek-v4.1-flash-1017"
        for suffix in ("-h", "-h1", "-h2", "-s1", "-b1", "-a1", "-x2", "-batch1", "-run2", "-round3", "-trial1", "-seed1", "-rep1"):
            self.assertEqual(model_identity.canonical_model_id(base + suffix), base, suffix)

    def test_reasoning_variant_is_preserved(self):
        base = "deepseek-v4.1-flash-1017"
        self.assertEqual(
            model_identity.canonical_model_id(base + "（Max）-h1"),
            base + "（max）",
        )
        self.assertNotEqual(
            model_identity.canonical_model_id(base + "（Max）-h1"),
            model_identity.canonical_model_id(base + "-h1"),
        )

    def test_case_insensitive_normalization_and_matching(self):
        self.assertEqual(
            model_identity.canonical_model_id("MiniMax-M3.1-Flash-s2"),
            model_identity.canonical_model_id("minimax-m3.1-flash-s1"),
        )
        self.assertTrue(model_identity.matches_batch_run("MiniMax-M3.1-Flash-s", "minimax-m3.1-flash-s2"))

    def test_version_suffix_is_not_stripped(self):
        self.assertEqual(model_identity.canonical_model_id("deepseek-v4.1-flash-1017-v2"), "deepseek-v4.1-flash-1017-v2")
        self.assertEqual(model_identity.canonical_model_id("deepseek-v4.1-flash-1017-ver2"), "deepseek-v4.1-flash-1017-ver2")
        self.assertEqual(model_identity.canonical_model_id("deepseek-v4.1-flash-1017-gpt4"), "deepseek-v4.1-flash-1017-gpt4")
        self.assertEqual(model_identity.canonical_model_id("deepseek-r1"), "deepseek-r1")
        self.assertEqual(model_identity.canonical_model_id("command-r"), "command-r")
        self.assertEqual(model_identity.canonical_model_id("deepseek-r1-h1"), "deepseek-r1")

    def test_explicit_batch_run_matching(self):
        base = "deepseek-v4.1-flash-1017"
        self.assertTrue(model_identity.matches_batch_run(base + "-h", base + "-h1"))
        self.assertTrue(model_identity.matches_batch_run(base + "-h1", base + "-h1"))
        self.assertTrue(model_identity.matches_batch_run(base + "-h1", base + "-h1-extra"))
        self.assertFalse(model_identity.matches_batch_run(base + "-h1", base + "-h10"))


class ReviewLogTests(unittest.TestCase):
    def rec(self, judge_id, d1, d2, d3, created_at):
        return {
            "schema_version": 1, "review_id": judge_id + created_at,
            "created_at": created_at, "judge_id": judge_id, "judge_model": "model-" + judge_id,
            "pack_id": "pack-x", "case_id": "case-01",
            "D1": d1, "D2": d2, "D3": d3,
        }

    def test_dedupe_latest_and_mean(self):
        reviews = [
            self.rec("a", 8, 7, 6, "2026-01-01T00:00:01+08:00"),
            self.rec("a", 9, 8, 7, "2026-01-01T00:00:02+08:00"),
            self.rec("b", 10, 8, 7, "2026-01-01T00:00:01+08:00"),
        ]
        used, duplicates = review_log.dedupe_latest(reviews)
        self.assertEqual(duplicates, 1)
        self.assertEqual(len(used), 2)
        groups = review_log.aggregate_reviews(used, "mean")
        self.assertEqual(groups[0]["judge_count"], 2)
        self.assertEqual(groups[0]["D1"], 9.5)
        self.assertEqual(groups[0]["D2"], 8.0)
        self.assertEqual(groups[0]["D3"], 7.0)
        self.assertEqual(groups[0]["D"], 24.5)

    def test_append_rejects_duplicate_judge(self):
        with tempfile.TemporaryDirectory() as td:
            log = Path(td) / "reviews.jsonl"
            rec = self.rec("a", 8, 7, 6, "2026-01-01T00:00:01+08:00")
            review_log.append_review(log, rec, reject_duplicate=True)
            self.assertEqual(len(review_log.read_reviews(log)), 1)
            with self.assertRaises(review_log.DuplicateReviewError):
                review_log.append_review(log, rec, reject_duplicate=True)


class FeeAndSpeedMetricTests(unittest.TestCase):
    def test_time_slot_fee_early_morning_window(self):
        self.assertEqual(metrics.time_slot_fee(360), 1.0)      # 06:00 接单 +1 元
        self.assertEqual(metrics.time_slot_fee(419.9), 1.0)    # 06:59 接单 +1 元
        self.assertEqual(metrics.time_slot_fee(420), 0.0)      # 07:00 起无早间补贴

    def test_fee_per_minute_scales_with_speed_multiplier(self):
        # 5 km 订单、配送费 8 元：1 倍速耗时 2*5+3=13 分，2 倍速耗时 1*5+3=8 分
        self.assertAlmostEqual(metrics.calc_fee_per_minute(8.0, 5.0, 1.0), round(8.0 / 13.0, 3))
        self.assertAlmostEqual(metrics.calc_fee_per_minute(8.0, 5.0, 2.0), 1.0)
        self.assertEqual(metrics.fee_per_minute_label(1.0), "fee/(2d+3)")
        self.assertEqual(metrics.fee_per_minute_label(2.0), "fee/(d+3)")

    def test_slow_orders_include_one_minute_delivery_action_cost(self):
        import json
        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            (work / "protocol.json").write_text(json.dumps({"movement": {"speed_multiplier": 2}}), encoding="utf-8")
            (work / "result.json").write_text(json.dumps({
                "status": "completed", "termination": "scene_completed", "rounds": 2,
                "snapshot": {"minute": 375.5, "remainingMinutes": 464.5, "battery": 90, "orders": []},
                "score": {"totalProfit": 5.0, "onTimeRate": 0.0, "completedOrders": 1, "onTimeOrders": 0,
                          "pathEfficiency": 1.0, "totalDistance": 2.0, "optimalDistance": 2.0,
                          "totalPenalty": 0.0, "totalRevenue": 5.0, "averageOvertime": 0.5, "batterySwaps": 0},
            }), encoding="utf-8")
            trace_lines = [
                {"type": "tool", "round": 1, "call": {"name": "accept_order", "arguments": {"orderId": "o1"}},
                 "response": {"success": True, "data": {"order": {"deliveryFee": 5.0}}},
                 "before": {"minute": 360.0, "battery": 95, "orders": [], "weight": 0,
                            "availableOrders": [{"id": "o1", "deliveryFee": 4.0, "distance": 2.0, "timeLimit": 15.0}]},
                 "after": {"minute": 360.0}},
                {"type": "tool", "round": 2, "call": {"name": "deliver_food", "arguments": {"orderId": "o1"}},
                 "response": {"success": True},
                 "before": {"minute": 374.5, "orders": [{"id": "o1"}]},
                 "after": {"minute": 375.5, "orders": []}},
            ]
            (work / "trace.jsonl").write_text("\n".join(json.dumps(x) for x in trace_lines), encoding="utf-8")
            m = metrics.analyze_work(work)
            self.assertEqual(m["nSlow"], 1)
            self.assertAlmostEqual(m["slowOrders"][0]["duration"], 15.5)
            self.assertAlmostEqual(m["slowOrders"][0]["over"], 0.5)

    def test_suspect_script_threshold_allows_fast_models(self):
        import json
        for gap_ms, expect_suspect in ((263, False), (20, True)):
            with tempfile.TemporaryDirectory() as td:
                work = Path(td)
                (work / "protocol.json").write_text("{}", encoding="utf-8")
                (work / "result.json").write_text(json.dumps({
                    "status": "completed", "termination": "scene_completed", "rounds": 2,
                    "snapshot": {"minute": 362.0, "remainingMinutes": 478.0, "battery": 98, "orders": []},
                    "score": {"totalProfit": 0.0, "onTimeRate": 1.0, "completedOrders": 0, "onTimeOrders": 0,
                              "pathEfficiency": 1.0, "totalDistance": 0.0, "optimalDistance": 0.0,
                              "totalPenalty": 0.0, "totalRevenue": 0.0, "averageOvertime": 0.0, "batterySwaps": 0},
                }), encoding="utf-8")
                trace_lines = [
                    {"type": "tool", "round": 1, "t": 1000, "call": {"name": "wait", "arguments": {"minutes": 1}},
                     "response": {"success": True}, "before": {"minute": 360.0, "orders": []}, "after": {"minute": 361.0, "orders": []}},
                    {"type": "tool", "round": 2, "t": 1000 + gap_ms, "call": {"name": "wait", "arguments": {"minutes": 1}},
                     "response": {"success": True}, "before": {"minute": 361.0, "orders": []}, "after": {"minute": 362.0, "orders": []}},
                ]
                (work / "trace.jsonl").write_text("\n".join(json.dumps(x) for x in trace_lines), encoding="utf-8")
                m = metrics.analyze_work(work)
                self.assertEqual(m["suspectScript"], expect_suspect, f"gap={gap_ms}")
                fc = metrics.factcard(m)
                self.assertEqual("疑似脚本代打" in fc, expect_suspect, f"factcard gap={gap_ms}")


class ObjectiveCacheAndFinalizePipelineTests(unittest.TestCase):
    def _make_run(self, root: Path, name: str, seed: int, profit: float):
        import hashlib, json
        run_dir = root / name
        run_dir.mkdir(parents=True, exist_ok=True)
        commit = hashlib.sha256(("sr:" + str(seed)).encode()).hexdigest()
        (run_dir / "protocol.json").write_text(json.dumps({
            "scene": {"seed_commit": commit},
            "arrival": {"mode": "sim_time", "batches_spawned": 10},
            "movement": {"speed_multiplier": 2},
            "timing": {"t0_source": "external"},
        }), encoding="utf-8")
        (run_dir / "result.json").write_text(json.dumps({
            "status": "completed", "termination": "scene_completed", "rounds": 5,
            "endToEndSeconds": 480.0, "wallSeconds": 480.0,
            "snapshot": {"minute": 840.0, "remainingMinutes": 0.0, "battery": 50.0, "orders": []},
            "score": {
                "totalProfit": profit, "onTimeRate": 1.0, "completedOrders": 10, "onTimeOrders": 10,
                "pathEfficiency": 1.05, "totalDistance": 105.0, "optimalDistance": 100.0,
                "totalPenalty": 0.0, "totalRevenue": profit, "averageOvertime": 0.0, "batterySwaps": 1,
            },
        }), encoding="utf-8")
        trace_lines = [
            {"type": "tool", "round": 1, "t": 1000, "call": {"name": "wait", "arguments": {"minutes": 5}},
             "response": {"success": True}, "before": {"minute": 360.0, "battery": 100, "orders": []},
             "after": {"minute": 365.0, "battery": 100, "orders": []}},
            {"type": "tool", "round": 2, "t": 3000, "call": {"name": "wait", "arguments": {"minutes": 5}},
             "response": {"success": True}, "before": {"minute": 365.0, "battery": 100, "orders": []},
             "after": {"minute": 370.0, "battery": 100, "orders": []}},
        ]
        (run_dir / "trace.jsonl").write_text("\n".join(json.dumps(x) for x in trace_lines), encoding="utf-8")
        return run_dir, commit

    def test_fingerprints_tamper_detection_and_realtime_blind_rescore(self):
        import json, os, subprocess
        import objective_cache, finalize
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            runs_dir = base / "runs"
            lb_dir = base / "leaderboard"
            bm_dir = lb_dir / "blind-maps"
            vd_dir = lb_dir / "verdicts"
            pack_dir = lb_dir / "blind" / "pack01"
            bm_dir.mkdir(parents=True)
            pack_dir.mkdir(parents=True)

            # 1) 创建模型 alpha（2 局）与 beta（2 局）
            a1, c_a1 = self._make_run(runs_dir, "alpha-s1", 101, 480.0)
            a2, c_a2 = self._make_run(runs_dir, "alpha-s2", 102, 360.0)
            b1, _ = self._make_run(runs_dir, "beta-s1", 101, 420.0)
            b2, _ = self._make_run(runs_dir, "beta-s2", 102, 420.0)

            seeds_file = base / "seeds.json"
            seeds_file.write_text(json.dumps({"seeds": [
                {"index": 1, "seed": 101},
                {"index": 2, "seed": 102},
            ]}), encoding="utf-8")

            # 2) 验证盲评打包直接生成盲评包与映射，且绝不生成客观分 评分.json
            blind_root = lb_dir / "blind"
            for m_name, r_list in (("alpha", [a1, a2]), ("beta", [b1, b2])):
                pack_res = subprocess.run(
                    [sys.executable, str(ROOT / "src" / "scoring" / "judge_pack.py"),
                     "--model", m_name, "--runs", *[str(x) for x in r_list],
                     "--blind-root", str(blind_root), "--blind-maps-dir", str(bm_dir)],
                    capture_output=True, text=True, encoding="utf-8",
                )
                self.assertEqual(pack_res.returncode, 0, pack_res.stdout + pack_res.stderr)
            self.assertTrue((a1 / "factcard.md").is_file())
            self.assertFalse((a1 / "评分.json").exists(), "盲评打包阶段严禁生成客观得分文件")

            alpha_map = json.loads(next(bm_dir.glob("alpha.*.blind-map.json")).read_text(encoding="utf-8"))
            beta_map = json.loads(next(bm_dir.glob("beta.*.blind-map.json")).read_text(encoding="utf-8"))
            pack_dir = blind_root / alpha_map["pack_id"]
            pack_beta_dir = blind_root / beta_map["pack_id"]

            rev_log = lb_dir / "reviews.jsonl"
            scores_md = lb_dir / "scores.md"

            def submit(pdir, cid, jid, d1, d2, d3):
                r = subprocess.run([
                    sys.executable, str(ROOT / "src" / "scoring" / "judge_submit.py"),
                    "--pack-dir", str(pdir), "--case-id", cid,
                    "--judge-id", jid, "--judge-model", "JudgeModel",
                    "--D1", str(d1), "--D2", str(d2), "--D3", str(d3),
                    "--evidence", "[E01] [F01]", "--note", "反证说明",
                    "--review-log", str(rev_log),
                ], capture_output=True, text=True, encoding="utf-8")
                self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

            submit(pack_dir, "case-01", "j1", 6, 5, 5)       # D=16
            submit(pack_dir, "case-02", "j1", 6, 5, 5)       # D=16
            submit(pack_beta_dir, "case-01", "j1", 9, 8, 8)  # D=25
            submit(pack_beta_dir, "case-02", "j1", 9, 8, 8)  # D=25

            old_sr_seeds = os.environ.get("SR_SEEDS")
            os.environ["SR_SEEDS"] = str(seeds_file)
            try:
                common_args = [
                    "--review-log", str(rev_log),
                    "--no-replay",
                    "--leaderboard-out", str(scores_md),
                    "--verdicts-dir", str(vd_dir),
                    "--blind-maps-dir", str(bm_dir),
                    "--runs-dir", str(runs_dir),
                ]
                # 3) 首次汇总：4 局全部计算客观分并写入双指纹
                rc = finalize.main(common_args)
                self.assertEqual(rc, 0)
                va = json.loads((vd_dir / "alpha.json").read_text(encoding="utf-8"))
                vb = json.loads((vd_dir / "beta.json").read_text(encoding="utf-8"))
                self.assertEqual(va["summary"]["objective_recomputed"], 2)
                self.assertEqual(va["summary"]["objective_cache_hits"], 0)
                sc_a1 = json.loads((a1 / "评分.json").read_text(encoding="utf-8"))
                self.assertIn("scoring_hash", sc_a1)
                self.assertIn("deliverables_hash", sc_a1)
                self.assertNotIn("D_judged", sc_a1)
                # 初始时 beta 总分高于 alpha，排第 1
                md_text = scores_md.read_text(encoding="utf-8")
                self.assertIn("| 1 | beta |", md_text)
                self.assertIn("| 2 | alpha |", md_text)

                # 4) 评委 j1 随时重评修改 alpha 的盲评分数（无需等待客观探针重跑，实时翻转排名）
                submit(pack_dir, "case-01", "j1", 11, 10, 9)  # D=30（覆盖此前 16）
                submit(pack_dir, "case-02", "j1", 11, 10, 9)  # D=30
                rc = finalize.main(common_args)
                self.assertEqual(rc, 0)
                va2 = json.loads((vd_dir / "alpha.json").read_text(encoding="utf-8"))
                self.assertEqual(va2["summary"]["objective_cache_hits"], 2)
                self.assertEqual(va2["summary"]["objective_recomputed"], 0)
                self.assertEqual(va2["mean"]["D"], 30.0)
                self.assertEqual(len(va2["runs"]), 2)  # 保留每局明细
                md_text2 = scores_md.read_text(encoding="utf-8")
                self.assertIn("| 1 | alpha |", md_text2)
                self.assertIn("| 2 | beta |", md_text2)

                # 5) 篡改 评分.json 内的客观分但保留原指纹 → 必须识别为 tampered 并自动重算还原
                real_a = sc_a1["A_outcome"]
                tampered = dict(sc_a1)
                tampered["A_outcome"] = 30.0
                (a1 / "评分.json").write_text(json.dumps(tampered), encoding="utf-8")
                ok, reason = objective_cache.verify_objective_cache(
                    tampered, seed=101, expected_commit=c_a1,
                    scoring_hash=sc_a1["scoring_hash"], deliverables_hash=sc_a1["deliverables_hash"],
                    require_replay=False,
                )
                self.assertFalse(ok)
                self.assertEqual(reason, "tampered")

                rc = finalize.main(common_args)
                self.assertEqual(rc, 0)
                va3 = json.loads((vd_dir / "alpha.json").read_text(encoding="utf-8"))
                # a1 被重算还原，a2 继续命中缓存
                self.assertEqual(va3["summary"]["objective_recomputed"], 1)
                self.assertEqual(va3["summary"]["objective_cache_hits"], 1)
                restored_sc = json.loads((a1 / "评分.json").read_text(encoding="utf-8"))
                self.assertEqual(restored_sc["A_outcome"], real_a)

                # 6) 交付物变动 1 字节 → deliverables_hash 失配，仅重算变动局
                (a2 / "trace.jsonl").write_text((a2 / "trace.jsonl").read_text(encoding="utf-8") + "\n", encoding="utf-8")
                rc = finalize.main(common_args)
                self.assertEqual(rc, 0)
                va4 = json.loads((vd_dir / "alpha.json").read_text(encoding="utf-8"))
                self.assertEqual(va4["summary"]["objective_recomputed"], 1)
                self.assertEqual(va4["summary"]["objective_cache_hits"], 1)

                # 7) --recompute 强制全量重算开关
                rc = finalize.main(common_args + ["--recompute"])
                self.assertEqual(rc, 0)
                va5 = json.loads((vd_dir / "alpha.json").read_text(encoding="utf-8"))
                self.assertEqual(va5["summary"]["objective_recomputed"], 2)
                self.assertEqual(va5["summary"]["objective_cache_hits"], 0)
            finally:
                if old_sr_seeds is None:
                    os.environ.pop("SR_SEEDS", None)
                else:
                    os.environ["SR_SEEDS"] = old_sr_seeds


if __name__ == "__main__":
    unittest.main()

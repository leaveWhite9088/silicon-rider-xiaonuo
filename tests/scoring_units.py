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


if __name__ == "__main__":
    unittest.main()

# -*- coding: utf-8 -*-
"""Scoring unit checks that do not need a full simulation run."""
import sys, unittest, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src" / "scoring"))
import metrics
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
        self.assertEqual(metrics.c3_level({"pathEff": 1.0, "emptyRatio": 0.9}), 7)
        self.assertEqual(metrics.c3_level({"pathEff": 1.0, "emptyRatio": 0.01}), 7)
        self.assertEqual(metrics.c3_level({"pathEff": 1.46}), 4)



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


if __name__ == "__main__":
    unittest.main()

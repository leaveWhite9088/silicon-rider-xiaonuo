# -*- coding: utf-8 -*-
"""Scoring unit checks that do not need a full simulation run."""
import sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src" / "scoring"))
import metrics


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


if __name__ == "__main__":
    unittest.main()

# -*- coding: utf-8 -*-
"""Unit checks for tools/timing_audit.py without needing real runs."""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import timing_audit


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def make_run(root, name, start, end, first_tool=None):
    d = root / name
    d.mkdir()
    proto = {
        "timing": {
            "t0_iso": iso(start),
            "process_iso": iso(start),
            "end_iso": iso(end),
        }
    }
    (d / "protocol.json").write_text(json.dumps(proto), encoding="utf-8")
    if first_tool is not None:
        rec = {"type": "tool", "t": int(first_tool.timestamp() * 1000)}
        (d / "trace.jsonl").write_text(json.dumps(rec) + "\n", encoding="utf-8")
    return d


BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)


class TimingAuditTests(unittest.TestCase):
    def test_sequential_same_model_is_ok(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            make_run(root, "m-s1", BASE, BASE + timedelta(minutes=10))
            make_run(root, "m-s2", BASE + timedelta(minutes=10), BASE + timedelta(minutes=20))
            rows = timing_audit.collect(root)
            self.assertEqual(len(rows), 2)
            self.assertTrue(all(r["b2_comparable"] for r in rows))
            self.assertTrue(timing_audit.build_report(rows)["ok"])

    def test_overlapping_same_model_is_flagged(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            make_run(root, "m-s1", BASE, BASE + timedelta(minutes=20))
            make_run(root, "m-s2", BASE + timedelta(minutes=5), BASE + timedelta(minutes=25))
            rows = timing_audit.collect(root)
            self.assertTrue(all(not r["b2_comparable"] for r in rows))
            report = timing_audit.build_report(rows)
            self.assertFalse(report["ok"])
            self.assertEqual(report["overlapRuns"], 2)

    def test_different_models_can_overlap(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            make_run(root, "a-s1", BASE, BASE + timedelta(minutes=20))
            make_run(root, "b-s1", BASE + timedelta(minutes=5), BASE + timedelta(minutes=25))
            rows = timing_audit.collect(root)
            self.assertTrue(all(r["b2_comparable"] for r in rows))
            self.assertTrue(timing_audit.build_report(rows)["ok"])

    def test_first_action_wait_is_reported(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            make_run(
                root, "m-s1", BASE, BASE + timedelta(minutes=10),
                first_tool=BASE + timedelta(minutes=5),
            )
            row = timing_audit.collect(root)[0]
            self.assertAlmostEqual(row["pre_first_min"], 5.0, places=6)


if __name__ == "__main__":
    unittest.main()

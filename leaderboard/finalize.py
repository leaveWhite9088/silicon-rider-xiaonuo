# -*- coding: utf-8 -*-
"""一键出榜入口：对 leaderboard/blind-maps/ 里发现的所有模型逐个运行 src/scoring/finalize.py。

用法：
    python leaderboard/finalize.py                 # 全部模型一次性出榜
    python leaderboard/finalize.py --dry-run       # 只打印不写榜
    python leaderboard/finalize.py --model Demo    # 只出某一个模型
    其他参数（--allow-partial / --d-aggregate median 等）原样转发。

结果写入 leaderboard/scores.md 与 leaderboard/verdicts/<模型>.json。
"""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

args = [
    sys.executable, str(ROOT / "src" / "scoring" / "finalize.py"),
    "--review-log", str(ROOT / "leaderboard" / "reviews.jsonl"),
    "--d-aggregate", "mean", "--min-judges", "1",
    *sys.argv[1:],
]
sys.exit(subprocess.run(args, cwd=str(ROOT)).returncode)

# -*- coding: utf-8 -*-
"""模型标识归一化：把同一模型的多个批次 run 合并到同一个模型 ID。

模型名可以带一个可读的批次后缀，例如：
    deepseek-v4.1-flash-1017-h1
    deepseek-v4.1-flash-1017-s1
    deepseek-v4.1-flash-1017（Max）-h1

汇总时只剥掉末尾的已知批次后缀：
    -h / -h1 / -s1 / -a1 / -b1 / -batch1 / -run1 / -round1 / -trial1 / -seed1 / -rep1

推理强度、版本等模型身份信息会保留：
    ...（Max）-h1 -> ...（Max）
    ...-v2       -> ...-v2
    deepseek-r1  -> deepseek-r1（不会被误剥成 deepseek）

无法自动判断时，用 --model-id 显式指定规范模型名。
"""
from __future__ import annotations

import re

_BATCH_SUFFIX_RE = re.compile(
    r"-(?:"
    r"(?:h|s)(?:[-_]?\d+)?"          # common batch markers: -h, -h1, -s2
    r"|(?!(?:v|ver|r)[-_]?\d+$)[a-z](?:[-_]?\d+)"  # -a1/-x2; keep -r1 (DeepSeek-R1), -v2
    r"|(?:batch|run|round|trial|seed|rep|repeat)(?:[-_]?\d+)?"  # word batches
    r")$",
    re.IGNORECASE,
)


def canonical_model_id(name: str) -> str:
    """Return the canonical model id used for leaderboard grouping."""
    text = (name or "").strip()
    if not text:
        return ""
    stripped = _BATCH_SUFFIX_RE.sub("", text)
    return stripped or text


def matches_batch_run(model_name: str, run_name: str) -> bool:
    """Whether run_name belongs to the explicitly named batch model_name."""
    model_name = (model_name or "").strip()
    run_name = (run_name or "").strip()
    if not model_name or not run_name:
        return False
    if run_name == model_name:
        return True
    if run_name.startswith(model_name + "-") or run_name.startswith(model_name + "_"):
        return True
    # e.g. model_name=...-h matches ...-h1 / ...-h2, but model_name=...-h1 does not match ...-h10.
    if model_name[-1].isalpha():
        return re.match(r"^" + re.escape(model_name) + r"\d+(?:[-_].*)?$", run_name) is not None
    return False


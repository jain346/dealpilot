"""Robust parser for agent outputs stored in ADK session state.

Handles raw dicts, Pydantic models, JSON strings, markdown-fenced JSON,
trailing commas, and Python literal formats returned by LLM agents.
"""

from __future__ import annotations

import ast
import json
import re
from typing import Any

from pydantic import BaseModel

from logging_config import logger


# Pattern to match markdown fenced code blocks (```json ... ``` or ``` ... ```)
_FENCE_PATTERN = re.compile(
    r"```(?:json)?\s*([\s\S]*?)\s*```",
    re.IGNORECASE,
)

# Trailing comma cleaner: removes commas immediately followed by closing braces/brackets
_TRAILING_COMMA_PATTERN = re.compile(
    r",\s*([\]\}])"
)


def clean_json_syntax(text: str) -> str:
    """Fix common LLM JSON syntax artifacts like trailing commas."""
    return _TRAILING_COMMA_PATTERN.sub(r"\1", text.strip())


def extract_json_candidate(text: str) -> str:
    """
    Extract the most plausible JSON substring from freeform text or markdown.
    
    1. Checks for markdown code fences.
    2. Falls back to finding the outermost braces `{ ... }` or brackets `[ ... ]`.
    """
    stripped = text.strip()

    # 1. Try markdown code fences first
    match = _FENCE_PATTERN.search(stripped)
    if match:
        candidate = match.group(1).strip()
        if candidate:
            return candidate

    # 2. Outermost object braces
    brace_start = stripped.find("{")
    brace_end = stripped.rfind("}")
    has_braces = brace_start >= 0 and brace_end > brace_start

    # 3. Outermost array brackets
    bracket_start = stripped.find("[")
    bracket_end = stripped.rfind("]")
    has_brackets = bracket_start >= 0 and bracket_end > bracket_start

    if has_braces and has_brackets:
        # Pick whichever enclosing container starts first
        if brace_start < bracket_start and brace_end > bracket_end:
            return stripped[brace_start : brace_end + 1]
        elif bracket_start < brace_start and bracket_end > brace_end:
            return stripped[bracket_start : bracket_end + 1]
        elif brace_start < bracket_start:
            return stripped[brace_start : brace_end + 1]
        else:
            return stripped[bracket_start : bracket_end + 1]

    if has_braces:
        return stripped[brace_start : brace_end + 1]

    if has_brackets:
        return stripped[bracket_start : bracket_end + 1]

    return stripped


def _try_parse_text(text: str) -> Any:
    """Attempt to parse a candidate text string via standard JSON or Python literal eval."""
    # Fast path: direct JSON
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        pass

    # Clean trailing commas and retry
    cleaned = clean_json_syntax(text)
    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        pass

    # Fallback: Python literal eval for strings formatted with single quotes or True/False/None
    try:
        parsed = ast.literal_eval(cleaned)
        if isinstance(parsed, (dict, list)):
            return parsed
    except (ValueError, SyntaxError, MemoryError, TypeError):
        pass

    return None


def parse_agent_output(value: Any) -> dict[str, Any] | None:
    """
    Convert an ADK output_key value into a Python dict.

    Handles:
    - None -> None
    - Pydantic BaseModel -> dict via model_dump()
    - dict -> dict
    - list of dicts -> wrapped as {"opportunities": list}
    - JSON string / markdown code block / python dict repr -> parsed dict
    - Malformed / non-JSON text -> logs warning and returns None
    """
    if value is None:
        return None

    # Already a dict
    if isinstance(value, dict):
        return value

    # Pydantic model
    if isinstance(value, BaseModel):
        return value.model_dump()

    # If already a list of dicts
    if isinstance(value, list):
        return {"opportunities": value}

    # String parsing
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None

        # 1. Direct parse attempt
        result = _try_parse_text(text)
        if result is not None:
            if isinstance(result, dict):
                return result
            if isinstance(result, list):
                return {"opportunities": result}

        # 2. Extract JSON candidate from fences or boundaries
        candidate = extract_json_candidate(text)
        if candidate and candidate != text:
            result = _try_parse_text(candidate)
            if result is not None:
                if isinstance(result, dict):
                    return result
                if isinstance(result, list):
                    return {"opportunities": result}

        # Failed to parse
        logger.warning(
            "agent_output_not_json",
            extra={"output_chars": len(text), "preview": text[:120]},
        )
        return None

    logger.warning(
        "unsupported_agent_output_type",
        extra={"type": type(value).__name__},
    )
    return None

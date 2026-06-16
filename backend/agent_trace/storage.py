"""JSON file persistence for agent traces and evaluations.

Files are stored under backend/.runtime/ following the same pattern
as backend/graph_snapshot/storage.py.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from .models import AgentEvaluation, AgentTrace

logger = logging.getLogger(__name__)

_RUNTIME_DIR = Path(__file__).resolve().parent.parent / ".runtime"
_TRACES_FILE = _RUNTIME_DIR / "agent_traces.json"
_EVALUATIONS_FILE = _RUNTIME_DIR / "agent_evaluations.json"


# ── Traces ────────────────────────────────────────────────────────

def save_traces(traces: list[AgentTrace]) -> None:
    """Persist trace list to JSON."""
    _RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    with open(_TRACES_FILE, "w", encoding="utf-8") as f:
        json.dump(
            [t.model_dump(mode="json") for t in traces],
            f, ensure_ascii=False, indent=2,
        )


def load_traces() -> list[AgentTrace]:
    """Load persisted traces from JSON."""
    if not _TRACES_FILE.exists():
        return []
    try:
        with open(_TRACES_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        return [AgentTrace(**item) for item in raw]
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning("Failed to load traces from %s: %s", _TRACES_FILE, e)
        return []
    except OSError as e:
        logger.warning("Cannot read traces file %s: %s", _TRACES_FILE, e)
        return []


def update_trace(trace: AgentTrace) -> None:
    """Update a single trace in the persisted JSON file.

    Loads all traces, replaces the one matching ``trace.trace_id``,
    and writes the list back.  If the trace is not found it is appended.
    """
    traces = load_traces()
    for i, t in enumerate(traces):
        if t.trace_id == trace.trace_id:
            traces[i] = trace
            break
    else:
        traces.append(trace)
    save_traces(traces)


# ── Evaluations ───────────────────────────────────────────────────

def save_evaluations(evaluations: list[AgentEvaluation]) -> None:
    """Persist evaluation list to JSON."""
    _RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    with open(_EVALUATIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(
            [e.model_dump(mode="json") for e in evaluations],
            f, ensure_ascii=False, indent=2,
        )


def load_evaluations() -> list[AgentEvaluation]:
    """Load persisted evaluations from JSON."""
    if not _EVALUATIONS_FILE.exists():
        return []
    try:
        with open(_EVALUATIONS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        return [AgentEvaluation(**item) for item in raw]
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning("Failed to load evaluations from %s: %s", _EVALUATIONS_FILE, e)
        return []
    except OSError as e:
        logger.warning("Cannot read evaluations file %s: %s", _EVALUATIONS_FILE, e)
        return []

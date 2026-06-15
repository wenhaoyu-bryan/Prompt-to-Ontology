"""JSON file persistence for graph snapshots and diffs.

Files are stored under backend/.runtime/ following the same pattern
as backend/data_pipeline/service.py.
"""

from __future__ import annotations

import json
from pathlib import Path

from .models import GraphDiff, GraphSnapshot

_RUNTIME_DIR = Path(__file__).resolve().parent.parent / ".runtime"
_SNAPSHOTS_FILE = _RUNTIME_DIR / "graph_snapshots.json"
_DIFFS_FILE = _RUNTIME_DIR / "graph_diffs.json"


# ── Snapshots ─────────────────────────────────────────────────────

def save_snapshots(snapshots: list[GraphSnapshot]) -> None:
    """Persist snapshot list to JSON."""
    _RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    with open(_SNAPSHOTS_FILE, "w", encoding="utf-8") as f:
        json.dump(
            [s.model_dump(mode="json") for s in snapshots],
            f, ensure_ascii=False, indent=2,
        )


def load_snapshots() -> list[GraphSnapshot]:
    """Load persisted snapshots from JSON."""
    if not _SNAPSHOTS_FILE.exists():
        return []
    try:
        with open(_SNAPSHOTS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        return [GraphSnapshot(**item) for item in raw]
    except (json.JSONDecodeError, Exception):
        return []


# ── Diffs ─────────────────────────────────────────────────────────

def save_diffs(diffs: list[GraphDiff]) -> None:
    """Persist diff list to JSON."""
    _RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    with open(_DIFFS_FILE, "w", encoding="utf-8") as f:
        json.dump(
            [d.model_dump(mode="json") for d in diffs],
            f, ensure_ascii=False, indent=2,
        )


def load_diffs() -> list[GraphDiff]:
    """Load persisted diffs from JSON."""
    if not _DIFFS_FILE.exists():
        return []
    try:
        with open(_DIFFS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        return [GraphDiff(**item) for item in raw]
    except (json.JSONDecodeError, Exception):
        return []

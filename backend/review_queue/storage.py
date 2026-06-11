"""JSON file persistence for review queue items and batches."""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from .models import ReviewBatch, ReviewItem

# Storage path: backend/.runtime/
_RUNTIME_DIR = Path(__file__).resolve().parent.parent / ".runtime"
_ITEMS_FILE = _RUNTIME_DIR / "review_items.json"
_BATCHES_FILE = _RUNTIME_DIR / "review_batches.json"

_lock = threading.Lock()


def _ensure_dir():
    _RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


# ── Items ──────────────────────────────────────────────────────────────

def load_items() -> list[ReviewItem]:
    _ensure_dir()
    if not _ITEMS_FILE.exists():
        return []
    try:
        with open(_ITEMS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        return [ReviewItem(**item) for item in raw]
    except (json.JSONDecodeError, Exception):
        return []


def save_items(items: list[ReviewItem]) -> None:
    _ensure_dir()
    with _lock:
        with open(_ITEMS_FILE, "w", encoding="utf-8") as f:
            json.dump([item.model_dump(mode="json") for item in items], f, ensure_ascii=False, indent=2)


def get_item(item_id: str) -> ReviewItem | None:
    for item in load_items():
        if item.id == item_id:
            return item
    return None


def upsert_item(item: ReviewItem) -> ReviewItem:
    items = load_items()
    found = False
    for i, existing in enumerate(items):
        if existing.id == item.id:
            items[i] = item
            found = True
            break
    if not found:
        items.append(item)
    save_items(items)
    return item


# ── Batches ────────────────────────────────────────────────────────────

def load_batches() -> list[ReviewBatch]:
    _ensure_dir()
    if not _BATCHES_FILE.exists():
        return []
    try:
        with open(_BATCHES_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        return [ReviewBatch(**batch) for batch in raw]
    except (json.JSONDecodeError, Exception):
        return []


def save_batches(batches: list[ReviewBatch]) -> None:
    _ensure_dir()
    with _lock:
        with open(_BATCHES_FILE, "w", encoding="utf-8") as f:
            json.dump([batch.model_dump(mode="json") for batch in batches], f, ensure_ascii=False, indent=2)


def get_batch(batch_id: str) -> ReviewBatch | None:
    for batch in load_batches():
        if batch.id == batch_id:
            return batch
    return None


def upsert_batch(batch: ReviewBatch) -> ReviewBatch:
    batches = load_batches()
    found = False
    for i, existing in enumerate(batches):
        if existing.id == batch.id:
            batches[i] = batch
            found = True
            break
    if not found:
        batches.append(batch)
    save_batches(batches)
    return batch

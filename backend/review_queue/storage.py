"""JSON file persistence for review queue items and batches."""

from __future__ import annotations

import json
import os
import threading
import tempfile
from pathlib import Path
from typing import Any

from .models import ReviewBatch, ReviewItem

# Storage path: backend/.runtime/
_RUNTIME_DIR = Path(__file__).resolve().parent.parent / ".runtime"
_ITEMS_FILE = _RUNTIME_DIR / "review_items.json"
_BATCHES_FILE = _RUNTIME_DIR / "review_batches.json"

_lock = threading.RLock()


def _ensure_dir():
    _RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


def _atomic_save(path: Path, records) -> None:
    _ensure_dir()
    fd, temp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump([record.model_dump(mode="json") for record in records], f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


# ── Items ──────────────────────────────────────────────────────────────

def load_items() -> list[ReviewItem]:
    with _lock:
        return _load_items_locked()

def _load_items_locked() -> list[ReviewItem]:
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
        _atomic_save(_ITEMS_FILE, items)


def get_item(item_id: str) -> ReviewItem | None:
    for item in load_items():
        if item.id == item_id:
            return item
    return None


def upsert_item(item: ReviewItem) -> ReviewItem:
    with _lock:
        return _upsert_item_locked(item)

def _upsert_item_locked(item):
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
    with _lock:
        return _load_batches_locked()

def _load_batches_locked() -> list[ReviewBatch]:
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
        _atomic_save(_BATCHES_FILE, batches)


def get_batch(batch_id: str) -> ReviewBatch | None:
    for batch in load_batches():
        if batch.id == batch_id:
            return batch
    return None


def upsert_batch(batch: ReviewBatch) -> ReviewBatch:
    with _lock:
        return _upsert_batch_locked(batch)

def _upsert_batch_locked(batch):
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


def insert_bundle(batch: ReviewBatch, items: list[ReviewItem]) -> None:
    """Atomically read and append a bundle within this process; retries preserve decisions."""
    with _lock:
        existing_items = load_items()
        known = {item.id for item in existing_items}
        existing_items.extend(item for item in items if item.id not in known)
        save_items(existing_items)
        existing_batches = load_batches()
        if not any(existing.id == batch.id for existing in existing_batches):
            existing_batches.append(batch)
            save_batches(existing_batches)


def clear_queue() -> None:
    """Clear both collections without interleaving another queue mutation."""
    with _lock:
        save_items([])
        save_batches([])

"""Feedback linked to real query traces in this single-user reference."""
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Literal
from pydantic import BaseModel, Field

_FILE = Path(__file__).resolve().parent.parent / ".runtime" / "query_feedback.json"
_LOCK = RLock()


class QueryFeedback(BaseModel):
    trace_id: str = Field(min_length=1, max_length=100)
    agent_run_id: str = Field(min_length=1, max_length=100)
    conversation_id: str = Field(min_length=1, max_length=100)
    turn_id: str = Field(min_length=1, max_length=100)
    rating: Literal["positive", "negative"]
    category: str = Field(default="", max_length=100)
    comment: str = Field(default="", max_length=2000)


def read_feedback() -> list[dict]:
    with _LOCK:
        return json.loads(_FILE.read_text(encoding="utf-8")) if _FILE.exists() else []


def save_feedback(request: QueryFeedback, trace) -> dict:
    if trace is None or trace.agent_run_id != request.agent_run_id:
        raise ValueError("Feedback must refer to a matching query trace and run")
    if request.rating == "negative" and not request.category.strip():
        raise ValueError("Select a reason for the correction")
    with _LOCK:
        rows = read_feedback()
        previous = next((row for row in rows if row["trace_id"] == request.trace_id), None)
        now = datetime.now(timezone.utc).isoformat()
        row = {**request.model_dump(), "id": previous["id"] if previous else f"feedback-{uuid.uuid4().hex[:12]}",
               "question": trace.question, "status": "recorded",
               "created_at": previous["created_at"] if previous else now, "updated_at": now}
        rows = [item for item in rows if item["trace_id"] != request.trace_id] + [row]
        _FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary = _FILE.with_suffix(".tmp")
        temporary.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary, _FILE)
        return row

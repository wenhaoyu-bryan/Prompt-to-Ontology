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
        submitted = request.model_dump()
        if previous and all(previous.get(key) == value for key, value in submitted.items()):
            return previous
        now = datetime.now(timezone.utc).isoformat()
        history = list((previous or {}).get('review_history', []))
        if previous and previous.get('review_status') == 'processed':
            history.append({key:previous.get(key) for key in ('review_status','review_note','reviewed_at','case_id')})
        row = {**(previous or {}), **submitted, "id": previous["id"] if previous else f"feedback-{uuid.uuid4().hex[:12]}",
               "question": trace.question, "status": "recorded",
               "review_status": "pending", "review_note": "",
               "review_history": history,
               "created_at": previous["created_at"] if previous else now, "updated_at": now}
        rows = [item for item in rows if item["trace_id"] != request.trace_id] + [row]
        _FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary = _FILE.with_suffix(".tmp")
        temporary.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary, _FILE)
        return row


def review_feedback(feedback_id, status, note='', case_id=None):
    if status not in ('pending', 'processed'):
        raise ValueError('Invalid feedback review status')
    with _LOCK:
        rows = read_feedback()
        row = next((r for r in rows if r['id'] == feedback_id), None)
        if row is None:
            raise ValueError('Feedback not found')
        row.update(review_status=status, review_note=note, reviewed_at=datetime.now(timezone.utc).isoformat())
        if case_id:
            row['case_id'] = case_id
        temporary = _FILE.with_suffix('.tmp')
        temporary.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
        os.replace(temporary, _FILE)
        return row

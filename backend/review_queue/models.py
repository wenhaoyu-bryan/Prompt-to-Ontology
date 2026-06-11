"""Review Queue models — HITL workflow for ontology graph mutations."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────

class ReviewItemStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    APPLIED = "applied"
    FAILED = "failed"


class ReviewBatchStatus(str, Enum):
    PENDING = "pending"
    PARTIALLY_REVIEWED = "partially_reviewed"
    APPROVED = "approved"
    REJECTED = "rejected"
    PARTIALLY_APPLIED = "partially_applied"
    APPLIED = "applied"
    FAILED = "failed"


class ReviewItemType(str, Enum):
    IMPORT_OBJECT_CANDIDATE = "IMPORT_OBJECT_CANDIDATE"
    IMPORT_LINK_CANDIDATE = "IMPORT_LINK_CANDIDATE"
    PROPERTY_CONFLICT = "PROPERTY_CONFLICT"
    VALIDATION_WARNING = "VALIDATION_WARNING"
    RULE_TRIGGERED_ACTION = "RULE_TRIGGERED_ACTION"
    AGENT_SUGGESTION = "AGENT_SUGGESTION"


class ReviewSource(str, Enum):
    IMPORT_PLAN = "import_plan"
    AGENT = "agent"
    RULE_ENGINE = "rule_engine"
    MANUAL = "manual"
    DEMO = "demo"


class ReviewSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"
    INFO = "info"


# ── Models ─────────────────────────────────────────────────────────────

class ReviewItem(BaseModel):
    id: str
    batch_id: str = ""
    type: ReviewItemType = ReviewItemType.IMPORT_OBJECT_CANDIDATE
    title: str = ""
    description: str = ""
    status: ReviewItemStatus = ReviewItemStatus.PENDING
    severity: ReviewSeverity = ReviewSeverity.MEDIUM
    source: ReviewSource = ReviewSource.IMPORT_PLAN
    source_plan_id: str = ""
    candidate_object: dict[str, Any] | None = None
    candidate_link: dict[str, Any] | None = None
    validation_issues: list[dict[str, Any]] = Field(default_factory=list)
    evidence: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    reviewed_at: datetime | None = None
    reviewed_by: str = ""
    decision_reason: str = ""
    applied_at: datetime | None = None
    apply_error: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReviewBatch(BaseModel):
    id: str
    source_type: ReviewSource = ReviewSource.IMPORT_PLAN
    source_id: str = ""
    source_plan_id: str = ""
    title: str = ""
    description: str = ""
    status: ReviewBatchStatus = ReviewBatchStatus.PENDING
    item_count: int = 0
    pending_count: int = 0
    approved_count: int = 0
    rejected_count: int = 0
    applied_count: int = 0
    failed_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReviewDecision(BaseModel):
    decision: str  # approve / reject
    reason: str = ""
    reviewed_by: str = "demo_user"


class ReviewApplyResult(BaseModel):
    item_id: str
    status: str
    applied: bool = False
    error: str = ""
    graph_object_id: str = ""
    graph_link_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReviewQueueSummary(BaseModel):
    total: int = 0
    pending: int = 0
    approved: int = 0
    rejected: int = 0
    applied: int = 0
    failed: int = 0
    by_type: dict[str, int] = Field(default_factory=dict)
    by_source: dict[str, int] = Field(default_factory=dict)
    by_severity: dict[str, int] = Field(default_factory=dict)


class ReviewBatchAndItems(BaseModel):
    batch: ReviewBatch
    items: list[ReviewItem] = Field(default_factory=list)

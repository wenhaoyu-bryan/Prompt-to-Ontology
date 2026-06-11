"""Agent Operator — models for ontology operator suggestions."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AgentActionType(str, Enum):
    SUGGEST_PROPERTY_UPDATE = "SUGGEST_PROPERTY_UPDATE"
    SUGGEST_LINK_CREATION = "SUGGEST_LINK_CREATION"
    SUGGEST_OBJECT_CREATION = "SUGGEST_OBJECT_CREATION"
    SUGGEST_RULE_ACTION = "SUGGEST_RULE_ACTION"
    FLAG_DATA_QUALITY_ISSUE = "FLAG_DATA_QUALITY_ISSUE"


class AgentSuggestionStatus(str, Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"


class AgentSuggestedAction(BaseModel):
    id: str = ""
    type: AgentActionType = AgentActionType.FLAG_DATA_QUALITY_ISSUE
    title: str = ""
    description: str = ""
    target_object_id: str = ""
    target_object_type: str = ""
    target_link_type: str = ""
    candidate_object: dict[str, Any] | None = None
    candidate_link: dict[str, Any] | None = None
    property_update: dict[str, Any] | None = None  # {object_id, property, old_value, new_value}
    rule_id: str = ""
    severity: str = "medium"
    confidence: float = 0.8
    reason: str = ""
    evidence: str = ""
    source_agent_run_id: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentSuggestionBatch(BaseModel):
    id: str = ""
    agent_run_id: str = ""
    user_message: str = ""
    status: AgentSuggestionStatus = AgentSuggestionStatus.DRAFT
    suggestions: list[AgentSuggestedAction] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentOperatorResult(BaseModel):
    answer: str = ""
    tool_trace: list[dict[str, Any]] = Field(default_factory=list)
    suggestions: list[AgentSuggestedAction] = Field(default_factory=list)
    review_batch_id: str = ""
    review_item_ids: list[str] = Field(default_factory=list)
    requires_review: bool = False
    can_submit_to_review: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)

"""Pydantic models for Agent Trace and Evaluation."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ToolCallTrace(BaseModel):
    tool_call_id: str
    tool_name: str
    input_summary: str = ""  # truncated, no secrets
    output_summary: str = ""  # truncated
    status: str = "success"  # success | error
    started_at: datetime | None = None
    completed_at: datetime | None = None


class ObjectReference(BaseModel):
    id: str
    type: str = ""
    label: str = ""


class RuleReference(BaseModel):
    id: str
    name: str = ""


class EvidenceEdgeReference(BaseModel):
    source_id: str
    target_id: str
    type: str = "TRIGGERS_RISK"


class SuggestionTrace(BaseModel):
    suggestion_id: str
    type: str = ""
    target_id: str = ""
    status: str = "generated"  # generated | submitted_to_review | applied | rejected | failed


class AgentTrace(BaseModel):
    trace_id: str
    agent_run_id: str
    question: str
    answer: str = ""
    status: str = "completed"  # completed | failed | partial
    started_at: datetime
    completed_at: datetime | None = None
    tool_calls: list[ToolCallTrace] = Field(default_factory=list)
    objects_referenced: list[ObjectReference] = Field(default_factory=list)
    rules_referenced: list[RuleReference] = Field(default_factory=list)
    evidence_edges_referenced: list[EvidenceEdgeReference] = Field(default_factory=list)
    suggestions: list[SuggestionTrace] = Field(default_factory=list)
    review_item_ids: list[str] = Field(default_factory=list)
    review_batch_id: str | None = None
    evaluation_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class EvaluationIssue(BaseModel):
    level: str = "warning"
    code: str = ""
    message: str = ""


class EvaluationScores(BaseModel):
    groundedness: float = 0.0
    tool_usage: float = 0.0
    evidence_coverage: float = 0.0
    review_safety: float = 1.0
    answer_completeness: float = 0.0


class AgentEvaluation(BaseModel):
    evaluation_id: str
    trace_id: str
    agent_run_id: str
    scores: EvaluationScores
    labels: dict[str, bool] = Field(default_factory=dict)
    issues: list[EvaluationIssue] = Field(default_factory=list)
    overall_status: str = "good"  # good | warning | failed
    created_at: datetime

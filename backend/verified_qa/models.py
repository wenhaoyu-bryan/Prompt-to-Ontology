"""Answer facts and paths are explicit so the UI cannot mistake them for prose."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class EvidenceRef(BaseModel):
    evidence_id: str
    kind: Literal["fact", "relationship", "rule", "source", "metric", "action"]
    source_path: str
    source_sha256: str
    record_id: str
    field: str
    value: Any = None


class PathStep(BaseModel):
    kind: Literal["instance_relation", "rule_evaluation", "source_binding", "metric_evaluation", "action_contract"]
    source_id: str
    relation: str
    target_id: str
    evidence_ids: list[str] = Field(default_factory=list)


class VerifiedAnswer(BaseModel):
    question_id: str
    question: str
    status: Literal["answered", "unknown", "not_applicable"]
    conclusion: str
    value: Any = None
    evidence: list[EvidenceRef] = Field(default_factory=list)
    path: list[PathStep] = Field(default_factory=list)
    unknown_reasons: list[str] = Field(default_factory=list)
    source_versions: dict[str, str] = Field(default_factory=dict)
    read_only: bool = True

"""Rule result standardization — typed model for rule evaluation output."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from .models import EvidenceMetadata, RuleStatus


class RuleEvaluationResult(BaseModel):
    """Standard result from evaluating a single rule against a single object."""

    rule_id: str
    rule_name: str
    object_id: str
    object_type: str = ""
    status: RuleStatus = RuleStatus.NOT_EVALUABLE
    severity: str = "info"
    reason: str = ""
    evidence: str = ""
    missing_fields: list[str] = Field(default_factory=list)
    not_applicable_reason: str = ""
    generated_links: list[dict[str, Any]] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    evaluated_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def is_triggered(self) -> bool:
        return self.status == RuleStatus.TRIGGERED

    @property
    def is_resolved(self) -> bool:
        return self.status in (RuleStatus.PASSED, RuleStatus.TRIGGERED)

    def to_legacy_dict(self) -> dict[str, Any]:
        """Convert to the plain dict format used by existing API responses."""
        return {
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "object_id": self.object_id,
            "status": self.status.value,
            "severity": self.severity,
            "reason": self.reason,
            "evidence": self.evidence,
            "missing_fields": self.missing_fields,
            "not_applicable_reason": self.not_applicable_reason,
        }

    def to_evidence_metadata(self) -> EvidenceMetadata:
        """Convert to EvidenceMetadata for storage on a TRIGGERS_RISK edge."""
        return EvidenceMetadata(
            source_type="rule",
            source_id=self.rule_id,
            reason=self.reason,
            confidence=1.0,
            generated_by="rule_engine",
            generated_at=self.evaluated_at,
        )

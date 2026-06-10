"""Evidence standardization — helpers for creating consistent evidence metadata."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from .models import EvidenceMetadata, ReviewStatus


def create_evidence_metadata(
    *,
    source_type: str = "",
    source_id: str = "",
    source_field: str = "",
    reason: str = "",
    confidence: float = 1.0,
    generated_by: str = "",
    review_status: ReviewStatus = ReviewStatus.AUTO_GENERATED,
    raw_payload: dict[str, Any] | None = None,
) -> EvidenceMetadata:
    """Create a standardized EvidenceMetadata instance."""
    return EvidenceMetadata(
        source_type=source_type,
        source_id=source_id,
        source_field=source_field,
        reason=reason,
        confidence=confidence,
        generated_by=generated_by or "ontology_kernel",
        generated_at=datetime.utcnow(),
        review_status=review_status,
        raw_payload=raw_payload or {},
    )


def create_rule_evidence_link(
    *,
    rule_id: str,
    rule_name: str,
    reason: str,
    severity: str,
    confidence: float = 1.0,
    generated_by: str = "rule_engine",
) -> dict[str, Any]:
    """Create a TRIGGERS_RISK edge dict with standardized evidence metadata.

    Returns a plain dict for backward compatibility with existing code
    that expects dict-based edges.
    """
    evidence = create_evidence_metadata(
        source_type="rule",
        source_id=rule_id,
        reason=reason,
        confidence=confidence,
        generated_by=generated_by,
    )
    return {
        "linkType": "TRIGGERS_RISK",
        "severity": severity,
        "reason": reason,
        "evidence": reason,
        "confidence": confidence,
        "rule_id": rule_id,
        "rule_name": rule_name,
        "generated_by": generated_by,
        "generated_at": evidence.generated_at.isoformat(),
        "review_status": evidence.review_status.value,
        "evidence_metadata": evidence.model_dump(mode="json"),
    }


def normalize_evidence_payload(raw: dict[str, Any]) -> EvidenceMetadata:
    """Normalize a raw dict (e.g. from YAML/Neo4j) into EvidenceMetadata."""
    return EvidenceMetadata(
        source_type=raw.get("source_type", raw.get("source", "")),
        source_id=raw.get("source_id", raw.get("rule_id", "")),
        source_field=raw.get("source_field", ""),
        reason=raw.get("reason", raw.get("evidence", "")),
        confidence=float(raw.get("confidence", 1.0)),
        generated_by=raw.get("generated_by", ""),
        review_status=ReviewStatus(raw.get("review_status", "auto_generated")),
        raw_payload=raw,
    )

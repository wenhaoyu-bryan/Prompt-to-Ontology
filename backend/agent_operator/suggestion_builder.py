"""Deterministic suggestion builder for common ontology operator cases."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from .models import AgentActionType, AgentSuggestedAction


def _new_id() -> str:
    return f"asg-{uuid.uuid4().hex[:10]}"


def build_property_update_suggestion(
    object_id: str,
    property_name: str,
    new_value: Any,
    old_value: Any = None,
    confidence: float = 0.8,
    reason: str = "",
    evidence: str = "",
    agent_run_id: str = "",
) -> AgentSuggestedAction:
    return AgentSuggestedAction(
        id=_new_id(),
        type=AgentActionType.SUGGEST_PROPERTY_UPDATE,
        title=f"Update {object_id}.{property_name} → {new_value}",
        description=f"Suggest updating property '{property_name}' on object '{object_id}' to '{new_value}'.",
        target_object_id=object_id,
        property_update={
            "object_id": object_id,
            "property": property_name,
            "old_value": old_value,
            "new_value": new_value,
        },
        confidence=confidence,
        reason=reason or "User requested property update",
        evidence=evidence,
        source_agent_run_id=agent_run_id,
        created_at=datetime.utcnow(),
    )


def build_link_creation_suggestion(
    source_id: str,
    target_id: str,
    link_type: str,
    properties: dict[str, Any] | None = None,
    confidence: float = 0.85,
    reason: str = "",
    evidence: str = "",
    agent_run_id: str = "",
) -> AgentSuggestedAction:
    return AgentSuggestedAction(
        id=_new_id(),
        type=AgentActionType.SUGGEST_LINK_CREATION,
        title=f"Create link: {source_id} -[{link_type}]-> {target_id}",
        description=f"Suggest creating {link_type} relationship from '{source_id}' to '{target_id}'.",
        target_object_id=source_id,
        target_link_type=link_type,
        candidate_link={
            "source_id": source_id,
            "target_id": target_id,
            "type": link_type,
            "properties": properties or {},
            "confidence": confidence,
            "evidence": evidence,
        },
        confidence=confidence,
        reason=reason or "User requested link creation",
        evidence=evidence,
        source_agent_run_id=agent_run_id,
        created_at=datetime.utcnow(),
    )


def build_object_creation_suggestion(
    object_id: str,
    object_type: str,
    properties: dict[str, Any] | None = None,
    confidence: float = 0.7,
    reason: str = "",
    evidence: str = "",
    agent_run_id: str = "",
) -> AgentSuggestedAction:
    return AgentSuggestedAction(
        id=_new_id(),
        type=AgentActionType.SUGGEST_OBJECT_CREATION,
        title=f"Create object: {object_type} {object_id}",
        description=f"Suggest creating new {object_type} object with id '{object_id}'.",
        target_object_id=object_id,
        target_object_type=object_type,
        candidate_object={
            "id": object_id,
            "type": object_type,
            "properties": properties or {},
            "confidence": confidence,
            "evidence": evidence,
        },
        confidence=confidence,
        reason=reason or "User requested object creation",
        evidence=evidence,
        source_agent_run_id=agent_run_id,
        created_at=datetime.utcnow(),
    )


def build_rule_action_suggestion(
    rule_id: str,
    target_object_id: str,
    title: str = "",
    description: str = "",
    severity: str = "high",
    confidence: float = 0.9,
    reason: str = "",
    evidence: str = "",
    agent_run_id: str = "",
) -> AgentSuggestedAction:
    return AgentSuggestedAction(
        id=_new_id(),
        type=AgentActionType.SUGGEST_RULE_ACTION,
        title=title or f"Rule action: {rule_id} on {target_object_id}",
        description=description or f"Review action needed for rule '{rule_id}' on object '{target_object_id}'.",
        target_object_id=target_object_id,
        rule_id=rule_id,
        related_rule_id=rule_id,
        severity=severity,
        confidence=confidence,
        reason=reason or "Rule triggered requiring review",
        evidence=evidence,
        source_agent_run_id=agent_run_id,
        created_at=datetime.utcnow(),
        metadata={
            "related_rule_id": rule_id,
            "related_rule_name": "",
        },
    )


def build_data_quality_issue_suggestion(
    target_object_id: str,
    issue_description: str,
    missing_fields: list[str] | None = None,
    severity: str = "medium",
    confidence: float = 0.95,
    reason: str = "",
    evidence: str = "",
    agent_run_id: str = "",
    # Phase 40 — field-specific enrichment
    missing_field: str = "",
    why_it_matters: str = "",
    related_rule_id: str = "",
    related_rule_name: str = "",
) -> AgentSuggestedAction:
    fields_str = ", ".join(missing_fields) if missing_fields else "unknown"
    # Phase 40: use single field name in title when available
    display_field = missing_field or fields_str
    title = f"Missing field: {display_field} on {target_object_id}" if missing_field else f"Data quality: {target_object_id} — missing {fields_str}"
    return AgentSuggestedAction(
        id=_new_id(),
        type=AgentActionType.FLAG_DATA_QUALITY_ISSUE,
        title=title,
        description=issue_description,
        target_object_id=target_object_id,
        severity=severity,
        confidence=confidence,
        reason=reason or f"Missing data fields: {fields_str}",
        evidence=evidence,
        source_agent_run_id=agent_run_id,
        created_at=datetime.utcnow(),
        metadata={
            "missing_fields": missing_fields or [],
            "missing_field": missing_fields[0] if missing_fields else "",
            "related_rule_id": related_rule_id or "",
            "related_rule_name": related_rule_name or "",
            "why_it_matters": why_it_matters or "",
        },
        missing_field=missing_field,
        why_it_matters=why_it_matters,
        related_rule_id=related_rule_id,
        related_rule_name=related_rule_name,
    )


def build_field_specific_data_quality_suggestion(
    target_object_id: str,
    missing_field: str,
    why_it_matters: str = "",
    related_rule_id: str = "",
    related_rule_name: str = "",
    severity: str = "medium",
    confidence: float = 0.95,
    reason: str = "",
    evidence: str = "",
    agent_run_id: str = "",
) -> AgentSuggestedAction:
    """Build a single-field data quality suggestion with full context."""
    title = f"Missing field: {missing_field} on {target_object_id}"
    desc = why_it_matters or f"Field '{missing_field}' is missing on {target_object_id}."
    return AgentSuggestedAction(
        id=_new_id(),
        type=AgentActionType.FLAG_DATA_QUALITY_ISSUE,
        title=title,
        description=desc,
        target_object_id=target_object_id,
        severity=severity,
        confidence=confidence,
        reason=reason or f"Missing field: {missing_field}",
        evidence=evidence,
        source_agent_run_id=agent_run_id,
        created_at=datetime.utcnow(),
        metadata={"missing_fields": [missing_field], "missing_field": missing_field, "related_rule_id": related_rule_id, "related_rule_name": related_rule_name, "why_it_matters": why_it_matters or ""},
        missing_field=missing_field,
        why_it_matters=why_it_matters,
        related_rule_id=related_rule_id,
        related_rule_name=related_rule_name,
    )

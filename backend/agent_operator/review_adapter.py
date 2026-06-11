"""Convert Agent suggestions into Review Queue items."""

from __future__ import annotations

import uuid
from datetime import datetime

from review_queue.models import (
    ReviewBatch,
    ReviewBatchStatus,
    ReviewItem,
    ReviewItemStatus,
    ReviewItemType,
    ReviewSeverity,
    ReviewSource,
)

from .models import AgentActionType, AgentSuggestedAction

# Map agent action types to review item types
_TYPE_MAP: dict[str, ReviewItemType] = {
    AgentActionType.SUGGEST_LINK_CREATION: ReviewItemType.IMPORT_LINK_CANDIDATE,
    AgentActionType.SUGGEST_OBJECT_CREATION: ReviewItemType.IMPORT_OBJECT_CANDIDATE,
    AgentActionType.SUGGEST_RULE_ACTION: ReviewItemType.RULE_TRIGGERED_ACTION,
    AgentActionType.FLAG_DATA_QUALITY_ISSUE: ReviewItemType.VALIDATION_WARNING,
    AgentActionType.SUGGEST_PROPERTY_UPDATE: ReviewItemType.AGENT_SUGGESTION,
}

_SEVERITY_MAP: dict[str, ReviewSeverity] = {
    "low": ReviewSeverity.LOW,
    "medium": ReviewSeverity.MEDIUM,
    "high": ReviewSeverity.HIGH,
    "critical": ReviewSeverity.CRITICAL,
    "info": ReviewSeverity.INFO,
}


def create_review_items_from_agent_suggestions(
    suggestions: list[AgentSuggestedAction],
    agent_run_id: str = "",
    user_message: str = "",
) -> tuple[ReviewBatch, list[ReviewItem]]:
    """Convert Agent suggestions into a ReviewBatch and ReviewItems."""
    now = datetime.utcnow()
    batch_id = f"batch-agent-{uuid.uuid4().hex[:10]}"

    batch = ReviewBatch(
        id=batch_id,
        source_type=ReviewSource.AGENT,
        source_id=agent_run_id,
        source_plan_id="",
        title=f"Agent suggestions for: {user_message[:60]}",
        description=f"{len(suggestions)} suggestion(s) from agent run {agent_run_id}",
        status=ReviewBatchStatus.PENDING,
        created_at=now,
        updated_at=now,
    )

    items: list[ReviewItem] = []
    for sug in suggestions:
        item_type = _TYPE_MAP.get(sug.type, ReviewItemType.AGENT_SUGGESTION)
        severity = _SEVERITY_MAP.get(sug.severity, ReviewSeverity.MEDIUM)

        item = ReviewItem(
            id=f"ri-agent-{uuid.uuid4().hex[:10]}",
            batch_id=batch_id,
            type=item_type,
            title=sug.title,
            description=sug.description,
            status=ReviewItemStatus.PENDING,
            severity=severity,
            source=ReviewSource.AGENT,
            source_plan_id="",
            candidate_object=sug.candidate_object,
            candidate_link=sug.candidate_link,
            validation_issues=[],
            evidence=sug.evidence,
            created_at=now,
            updated_at=now,
            metadata={
                "agent_action_type": sug.type.value,
                "agent_run_id": agent_run_id,
                "user_message": user_message,
                "target_object_id": sug.target_object_id,
                "property_update": sug.property_update,
                "rule_id": sug.rule_id,
                "reason": sug.reason,
                **sug.metadata,
            },
        )
        items.append(item)

    batch.item_count = len(items)
    batch.pending_count = len(items)
    return batch, items

"""Agent Operator service — analyze agent answers, generate suggestions, submit to review."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any

from review_queue.storage import load_items, save_items, upsert_batch

from .models import AgentActionType, AgentOperatorResult, AgentSuggestedAction, AgentSuggestionBatch
from .review_adapter import create_review_items_from_agent_suggestions
from .suggestion_builder import (
    build_data_quality_issue_suggestion,
    build_link_creation_suggestion,
    build_object_creation_suggestion,
    build_property_update_suggestion,
    build_rule_action_suggestion,
)

# Intent patterns for property update
_PROPERTY_UPDATE_PATTERNS = [
    r"(?:set|update|change|correct)\s+(\w+)\s+(\w+)\s+(?:to|=)\s+(.+)",
    r"(?:把|设置|修改|更正)\s*(\w+)\s*(?:的)?\s*(\w+)\s*(?:改为|设为|改成|更新为)\s*(.+)",
]

# Intent patterns for link creation
_LINK_CREATE_PATTERNS = [
    r"(?:add|create|link)\s+(\w+)\s+(?:as\s+)?(?:an?\s+)?(?:ingredient|component|relation)\s+(?:for|to|of)\s+(\w+)",
    r"(?:add|create)\s+(?:a\s+)?(?:\w+)\s+(?:relationship|link|edge)\s+(?:from|between)\s+(\w+)\s+(?:to|and)\s+(\w+)",
]

# Intent patterns for object creation
_OBJECT_CREATE_PATTERNS = [
    r"(?:create|add|new)\s+(?:a\s+)?(\w+)\s+(?:object|node|entity)\s+(?:with\s+id\s+)?(\w+)",
]


def analyze_agent_answer_for_suggestions(
    question: str,
    agent_result: dict[str, Any],
    agent_run_id: str = "",
) -> list[AgentSuggestedAction]:
    """Analyze agent answer and tool results to generate deterministic suggestions."""
    suggestions: list[AgentSuggestedAction] = []
    tool_results = []

    # Extract tool results from logs
    for log in agent_result.get("logs", []):
        if log.get("type") == "observation":
            tool_results.append(log)

    # 1. Check for missing data (not_evaluable rules)
    answer = agent_result.get("answer", "")
    if "not_evaluable" in answer.lower() or "missing" in answer.lower() or "insufficient" in answer.lower():
        # Extract product IDs mentioned
        product_ids = re.findall(r'\b(PF\d+)\b', answer)
        for pid in set(product_ids[:3]):  # Limit to 3
            suggestions.append(build_data_quality_issue_suggestion(
                target_object_id=pid,
                issue_description=f"Agent detected missing or insufficient data for {pid}.",
                missing_fields=["data_quality"],
                confidence=0.9,
                reason="Agent analysis detected not_evaluable rules or missing data",
                evidence=answer[:200],
                agent_run_id=agent_run_id,
            ))

    # 2. Check for triggered risk rules
    if "triggered" in answer.lower() or "risk" in answer.lower():
        product_ids = re.findall(r'\b(PF\d+)\b', answer)
        rule_ids = re.findall(r'\b(R\d+)\b', answer)
        for pid in set(product_ids[:2]):
            for rid in set(rule_ids[:2]) if rule_ids else ["UNKNOWN_RULE"]:
                suggestions.append(build_rule_action_suggestion(
                    rule_id=rid,
                    target_object_id=pid,
                    severity="high",
                    confidence=0.85,
                    reason="Risk rule triggered, requires human review",
                    evidence=answer[:200],
                    agent_run_id=agent_run_id,
                ))

    # 3. Check for explicit property update intent
    for pattern in _PROPERTY_UPDATE_PATTERNS:
        match = re.search(pattern, question, re.IGNORECASE)
        if match:
            groups = match.groups()
            if len(groups) >= 3:
                obj_id, prop, val = groups[0], groups[1], groups[2].strip()
                suggestions.append(build_property_update_suggestion(
                    object_id=obj_id.upper(),
                    property_name=prop,
                    new_value=val,
                    confidence=0.75,
                    reason="User requested property update via agent",
                    agent_run_id=agent_run_id,
                ))
            break

    # 4. Check for link creation intent
    for pattern in _LINK_CREATE_PATTERNS:
        match = re.search(pattern, question, re.IGNORECASE)
        if match:
            groups = match.groups()
            if len(groups) >= 2:
                src, tgt = groups[0].upper(), groups[1].upper()
                suggestions.append(build_link_creation_suggestion(
                    source_id=src,
                    target_id=tgt,
                    link_type="CONTAINS",
                    confidence=0.7,
                    reason="User requested link creation via agent",
                    agent_run_id=agent_run_id,
                ))
            break

    # 5. Check for object creation intent
    for pattern in _OBJECT_CREATE_PATTERNS:
        match = re.search(pattern, question, re.IGNORECASE)
        if match:
            groups = match.groups()
            if len(groups) >= 2:
                obj_type, obj_id = groups[0].capitalize(), groups[1].upper()
                suggestions.append(build_object_creation_suggestion(
                    object_id=obj_id,
                    object_type=obj_type,
                    confidence=0.65,
                    reason="User requested object creation via agent",
                    agent_run_id=agent_run_id,
                ))
            break

    return suggestions


def submit_agent_suggestions_to_review(
    suggestions: list[AgentSuggestedAction],
    agent_run_id: str = "",
    user_message: str = "",
) -> AgentSuggestionBatch:
    """Submit agent suggestions to the Review Queue."""
    if not suggestions:
        raise ValueError("No suggestions to submit")

    batch, items = create_review_items_from_agent_suggestions(
        suggestions, agent_run_id=agent_run_id, user_message=user_message,
    )

    # Persist batch and items
    upsert_batch(batch)
    all_items = load_items()
    all_items.extend(items)
    save_items(all_items)

    suggestion_batch = AgentSuggestionBatch(
        id=batch.id,
        agent_run_id=agent_run_id,
        user_message=user_message,
        status="submitted",
        suggestions=suggestions,
        created_at=datetime.utcnow(),
    )

    return suggestion_batch

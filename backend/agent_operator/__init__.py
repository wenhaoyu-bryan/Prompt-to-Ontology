"""Agent Operator — propose reviewable ontology updates from agent interactions."""

from .models import (
    AgentActionType,
    AgentOperatorResult,
    AgentSuggestedAction,
    AgentSuggestionBatch,
    AgentSuggestionStatus,
)
from .service import (
    analyze_agent_answer_for_suggestions,
    submit_agent_suggestions_to_review,
)
from .review_adapter import create_review_items_from_agent_suggestions
from .suggestion_builder import (
    build_property_update_suggestion,
    build_link_creation_suggestion,
    build_object_creation_suggestion,
    build_rule_action_suggestion,
    build_data_quality_issue_suggestion,
)

__all__ = [
    "AgentActionType", "AgentOperatorResult", "AgentSuggestedAction",
    "AgentSuggestionBatch", "AgentSuggestionStatus",
    "analyze_agent_answer_for_suggestions", "submit_agent_suggestions_to_review",
    "create_review_items_from_agent_suggestions",
    "build_property_update_suggestion", "build_link_creation_suggestion",
    "build_object_creation_suggestion", "build_rule_action_suggestion",
    "build_data_quality_issue_suggestion",
]

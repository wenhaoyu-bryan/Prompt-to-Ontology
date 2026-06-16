"""Agent Trace -- trace, evaluate, and audit agent chat runs.

Captures the full lifecycle of an agent interaction:
tool calls, referenced objects/rules/evidence edges, suggestions,
and deterministic evaluation scores.
"""

from .models import (
    AgentEvaluation,
    AgentTrace,
    EvaluationIssue,
    EvaluationScores,
    EvidenceEdgeReference,
    ObjectReference,
    RuleReference,
    SuggestionTrace,
    ToolCallTrace,
)
from .service import (
    create_trace,
    evaluate_trace,
    get_evaluation,
    get_trace,
    list_evaluations,
    list_traces,
    update_trace_review_info,
    update_trace_review_status,
)

__all__ = [
    # Models
    "AgentEvaluation",
    "AgentTrace",
    "EvaluationIssue",
    "EvaluationScores",
    "EvidenceEdgeReference",
    "ObjectReference",
    "RuleReference",
    "SuggestionTrace",
    "ToolCallTrace",
    # Service
    "create_trace",
    "evaluate_trace",
    "get_evaluation",
    "get_trace",
    "list_evaluations",
    "list_traces",
    "update_trace_review_info",
    "update_trace_review_status",
]

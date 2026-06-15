"""
Rule Studio -- a backend module for browsing, inspecting, evaluating, and
simulating ontology rules.

Public API (importable from ``rule_studio``):
    - list_rules()              -> list[RuleSummary]
    - get_rule_detail(rule_id)  -> RuleDetail
    - get_evaluation_summary()  -> EvaluationSummary
    - get_product_rules(pid)    -> list[dict]
    - simulate_rule(request)    -> SimulationResult
"""

from .models import (
    EvaluationSummary,
    RuleCoverageByProduct,
    RuleCoverageByRule,
    RuleCoverageSummary,
    RuleDetail,
    RuleSummary,
    SimulationRequest,
    SimulationResult,
)
from .service import (
    get_evaluation_summary,
    get_product_rules,
    get_rule_detail,
    list_rules,
    reset_cache,
    simulate_rule,
)

__all__ = [
    # Models
    "RuleSummary",
    "RuleDetail",
    "RuleCoverageSummary",
    "RuleCoverageByRule",
    "RuleCoverageByProduct",
    "EvaluationSummary",
    "SimulationRequest",
    "SimulationResult",
    # Service functions
    "list_rules",
    "get_rule_detail",
    "get_evaluation_summary",
    "get_product_rules",
    "simulate_rule",
    "reset_cache",
]

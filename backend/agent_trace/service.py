"""Core service for Agent Trace and Evaluation.

Provides trace creation from agent chat results, deterministic evaluation,
and trace lifecycle management (review status updates).
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

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
from .storage import (
    load_evaluations,
    load_traces,
    save_evaluations,
    save_traces,
    update_trace,
)


# ── Helpers ───────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_trace_id() -> str:
    return f"trace-{uuid.uuid4().hex[:12]}"


def _new_eval_id() -> str:
    return f"eval-{uuid.uuid4().hex[:12]}"


def _new_tool_call_id() -> str:
    return f"tc-{uuid.uuid4().hex[:10]}"


def _truncate(text: str, max_len: int = 200) -> str:
    """Truncate a string, appending '...' if it exceeds max_len."""
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."


# ── Trace Creation ────────────────────────────────────────────────

def create_trace(
    question: str,
    answer: str,
    agent_run_id: str,
    result: dict,
    metadata: dict | None = None,
) -> AgentTrace:
    """Create a trace from an agent chat result dict.

    Extracts from *result*:
    - ``tools_used`` (list[str]) -> ``tool_calls``
    - product data / evidence -> ``objects_referenced``
    - rule IDs -> ``rules_referenced``
    - TRIGGERS_RISK edges -> ``evidence_edges_referenced``
    - ``suggestions`` -> ``suggestions``

    Does NOT store chain-of-thought or raw LLM prompts.
    """
    started_at = _now()
    completed_at = _now()

    # -- Tool calls ------------------------------------------------
    tool_names: list[str] = result.get("tools_used", [])
    tool_calls: list[ToolCallTrace] = []
    for tn in tool_names:
        tool_calls.append(ToolCallTrace(
            tool_call_id=_new_tool_call_id(),
            tool_name=tn,
            status="success",
            started_at=started_at,
            completed_at=completed_at,
        ))

    # -- Objects referenced ----------------------------------------
    objects_referenced: list[ObjectReference] = []
    seen_object_ids: set[str] = set()
    _extract_objects_from_result(result, objects_referenced, seen_object_ids)

    # -- Rules referenced ------------------------------------------
    rules_referenced: list[RuleReference] = []
    seen_rule_ids: set[str] = set()
    _extract_rules_from_result(result, rules_referenced, seen_rule_ids)

    # -- Evidence edges (TRIGGERS_RISK) ----------------------------
    evidence_edges: list[EvidenceEdgeReference] = []
    seen_edge_keys: set[tuple[str, str]] = set()
    _extract_evidence_edges_from_result(result, evidence_edges, seen_edge_keys)

    # -- Suggestions -----------------------------------------------
    suggestion_traces: list[SuggestionTrace] = []
    raw_suggestions: list[dict] = result.get("suggestions", [])
    for s in raw_suggestions:
        suggestion_traces.append(SuggestionTrace(
            suggestion_id=s.get("id", ""),
            type=s.get("type", ""),
            target_id=s.get("target_object_id", ""),
            status="generated",
            metadata={k: v for k, v in s.items() if k not in ("id", "type", "target_object_id")},
        ))

    # -- Review info -----------------------------------------------
    review_item_ids: list[str] = result.get("review_item_ids", [])
    review_batch_id: str | None = result.get("review_batch_id")

    # -- Determine status ------------------------------------------
    status = "completed"
    if not answer:
        status = "failed"

    # -- Sanitize metadata: drop chain-of-thought ------------------
    safe_metadata: dict[str, Any] = {}
    if metadata:
        for k, v in metadata.items():
            if k in ("logs", "raw_prompt", "raw_response", "chain_of_thought"):
                continue
            safe_metadata[k] = v
    safe_metadata["llm_used"] = result.get("llm_used", False)

    trace = AgentTrace(
        trace_id=_new_trace_id(),
        agent_run_id=agent_run_id,
        question=question,
        answer=answer,
        status=status,
        started_at=started_at,
        completed_at=completed_at,
        tool_calls=tool_calls,
        objects_referenced=objects_referenced,
        rules_referenced=rules_referenced,
        evidence_edges_referenced=evidence_edges,
        suggestions=suggestion_traces,
        review_item_ids=review_item_ids,
        review_batch_id=review_batch_id,
        metadata=safe_metadata,
    )

    # Persist
    traces = load_traces()
    traces.append(trace)
    save_traces(traces)

    return trace


# ── Extraction helpers ────────────────────────────────────────────

def _extract_objects_from_result(
    result: dict,
    out: list[ObjectReference],
    seen: set[str],
) -> None:
    """Walk the result dict and collect unique product / object references."""

    def _add_object(obj_id: str, obj_type: str = "", label: str = "") -> None:
        if not obj_id or obj_id in seen:
            return
        seen.add(obj_id)
        out.append(ObjectReference(id=obj_id, type=obj_type, label=label))

    def _scan_value(val: Any) -> None:
        if isinstance(val, dict):
            # Product-like dict with an id field
            pid = val.get("id") or val.get("product_id")
            pname = val.get("product_name") or val.get("name", "")
            if pid:
                _add_object(str(pid), "PetFoodProduct", str(pname))
            # Brand
            bid = val.get("brand_id")
            bname = val.get("brand_name", "")
            if bid:
                _add_object(str(bid), "Brand", str(bname))
            # Nested product (e.g. tool result data.product)
            if "product" in val and isinstance(val["product"], dict):
                p = val["product"]
                p_id = p.get("id") or p.get("product_id", "")
                p_name = p.get("product_name", "")
                if p_id:
                    _add_object(str(p_id), "PetFoodProduct", str(p_name))
            # Recurse into all values
            for v in val.values():
                _scan_value(v)
        elif isinstance(val, list):
            for item in val:
                _scan_value(item)

    # Top-level product fields
    for key in ("products", "data", "product"):
        if key in result:
            _scan_value(result[key])

    # Also scan evidence and limitations for object references
    for key in ("evidence", "limitations"):
        if key in result and isinstance(result[key], list):
            for item in result[key]:
                _scan_value(item)


def _extract_rules_from_result(
    result: dict,
    out: list[RuleReference],
    seen: set[str],
) -> None:
    """Walk the result dict and collect unique rule references."""

    def _add_rule(rule_id: str, rule_name: str = "") -> None:
        if not rule_id or rule_id in seen:
            return
        seen.add(rule_id)
        out.append(RuleReference(id=rule_id, name=rule_name))

    def _scan_value(val: Any) -> None:
        if isinstance(val, dict):
            rid = val.get("rule_id") or val.get("id")
            rname = val.get("rule_name") or val.get("name", "")
            # Only treat as rule if it looks like a rule (has rule_id or rule-like fields)
            if rid and ("rule_id" in val or "rule_name" in val or "severity" in val):
                _add_rule(str(rid), str(rname))
            for v in val.values():
                _scan_value(v)
        elif isinstance(val, list):
            for item in val:
                _scan_value(item)
        elif isinstance(val, str):
            # Evidence strings like "RR001: high fat content" — extract rule IDs
            matches = re.findall(r"(RR\d+)", val)
            for m in matches:
                _add_rule(m)

    for key in ("rules", "data", "risks", "not_evaluable", "evidence", "limitations"):
        if key in result:
            _scan_value(result[key])

    # Also scan top-level result for nested dicts
    _scan_value(result)


def _extract_evidence_edges_from_result(
    result: dict,
    out: list[EvidenceEdgeReference],
    seen: set[tuple[str, str]],
) -> None:
    """Walk the result dict and collect TRIGGERS_RISK edge references."""

    def _add_edge(source_id: str, target_id: str) -> None:
        key = (source_id, target_id)
        if key in seen:
            return
        seen.add(key)
        out.append(EvidenceEdgeReference(
            source_id=source_id,
            target_id=target_id,
            type="TRIGGERS_RISK",
        ))

    # Pre-scan: collect product-like IDs found in the result.
    # A dict is considered product-like if it has product_name or target_species,
    # or if it appears under a "products" key.  This avoids picking up
    # unrelated IDs (e.g. suggestion IDs).
    _found_product_ids: set[str] = set()

    def _collect_product_ids(val: Any, under_products_key: bool = False) -> None:
        if isinstance(val, dict):
            pid = val.get("id") or val.get("product_id")
            is_product_like = (
                under_products_key
                or "product_name" in val
                or "target_species" in val
                or "product_id" in val
            )
            if pid and isinstance(pid, str) and is_product_like:
                _found_product_ids.add(pid)
            for k, v in val.items():
                _collect_product_ids(v, under_products_key=(k == "products"))
        elif isinstance(val, list):
            for item in val:
                _collect_product_ids(item, under_products_key=under_products_key)

    _collect_product_ids(result)

    def _scan_value(val: Any, parent_product_id: str = "") -> None:
        if isinstance(val, dict):
            # Explicit edge structure
            if val.get("type") == "TRIGGERS_RISK":
                src = val.get("source_id", "")
                tgt = val.get("target_id", "")
                if src and tgt:
                    _add_edge(str(src), str(tgt))
            # Risk entries: product triggers a rule
            product_id = val.get("product_id") or parent_product_id
            rule_id = val.get("rule_id", "")
            if product_id and rule_id and "severity" in val:
                _add_edge(str(product_id), str(rule_id))
            # Propagate product ID to nested structures
            current_product = val.get("product_id") or val.get("id", "") or parent_product_id
            for v in val.values():
                _scan_value(v, current_product)
        elif isinstance(val, list):
            for item in val:
                _scan_value(item, parent_product_id)

    for key in ("data", "risks", "evidence"):
        if key in result:
            _scan_value(result[key])

    # Nested product data that may contain risk edges
    _scan_value(result)

    # Fallback: if we found risks with rule_id+severity but no product context
    # propagated, and we have exactly one product ID in the result, use it.
    if len(_found_product_ids) == 1:
        fallback_pid = next(iter(_found_product_ids))

        def _backfill(val: Any) -> None:
            if isinstance(val, dict):
                rule_id = val.get("rule_id", "")
                product_id = val.get("product_id") or ""
                if rule_id and "severity" in val and not product_id and fallback_pid:
                    _add_edge(str(fallback_pid), str(rule_id))
                for v in val.values():
                    _backfill(v)
            elif isinstance(val, list):
                for item in val:
                    _backfill(item)

        for key in ("data", "risks", "evidence"):
            if key in result:
                _backfill(result[key])


# ── Trace CRUD ────────────────────────────────────────────────────

def list_traces(limit: int = 50, status: str | None = None) -> list[AgentTrace]:
    """Return most recent traces, optionally filtered by status."""
    traces = load_traces()
    if status:
        traces = [t for t in traces if t.status == status]
    return traces[-limit:]


def get_trace(trace_id: str) -> AgentTrace | None:
    """Return a single trace by ID."""
    for t in load_traces():
        if t.trace_id == trace_id:
            return t
    return None


# ── Evaluation ────────────────────────────────────────────────────

def evaluate_trace(trace_id: str) -> AgentEvaluation:
    """Run deterministic evaluation on a trace.

    Scoring rules:
    - groundedness: 1.0 if answer length > 50 and has specific content, 0.5 if short, 0.0 if empty
    - tool_usage: 1.0 if tool_calls > 0, 0.0 if no tools used
    - evidence_coverage: 1.0 if evidence_edges_referenced > 0 and rules_referenced > 0,
                         0.5 if either one, 0.0 if neither
    - review_safety: 1.0 if no direct graph mutation, 0.0 if bypassed_review_queue
    - answer_completeness: 1.0 if answer > 100 chars, 0.5 if 50-100, 0.0 if < 50

    Issues:
    - LOW_EVIDENCE_COVERAGE: if evidence_edges empty but answer mentions risks
    - NO_TOOL_CALLS: if tools_used is empty
    - NO_RULE_REFERENCES: if rules_referenced is empty
    """
    trace = get_trace(trace_id)
    if trace is None:
        raise ValueError(f"Trace not found: {trace_id}")

    now = _now()
    answer_len = len(trace.answer)

    # -- Scores ----------------------------------------------------
    # groundedness
    if answer_len == 0:
        groundedness = 0.0
    elif answer_len > 50:
        groundedness = 1.0
    else:
        groundedness = 0.5

    # tool_usage
    tool_usage = 1.0 if len(trace.tool_calls) > 0 else 0.0

    # evidence_coverage
    has_edges = len(trace.evidence_edges_referenced) > 0
    has_rules = len(trace.rules_referenced) > 0
    if has_edges and has_rules:
        evidence_coverage = 1.0
    elif has_edges or has_rules:
        evidence_coverage = 0.5
    else:
        evidence_coverage = 0.0

    # review_safety — check metadata for bypass indicators
    bypassed = trace.metadata.get("bypassed_review_queue", False)
    review_safety = 0.0 if bypassed else 1.0

    # answer_completeness
    if answer_len > 100:
        answer_completeness = 1.0
    elif answer_len >= 50:
        answer_completeness = 0.5
    else:
        answer_completeness = 0.0

    scores = EvaluationScores(
        groundedness=groundedness,
        tool_usage=tool_usage,
        evidence_coverage=evidence_coverage,
        review_safety=review_safety,
        answer_completeness=answer_completeness,
    )

    # -- Issues ----------------------------------------------------
    issues: list[EvaluationIssue] = []

    answer_lower = trace.answer.lower()
    risk_keywords = ("risk", "danger", "hazard", "trigger", "warning", "caution")

    if not trace.evidence_edges_referenced and any(kw in answer_lower for kw in risk_keywords):
        issues.append(EvaluationIssue(
            level="warning",
            code="LOW_EVIDENCE_COVERAGE",
            message="Answer mentions risks but no TRIGGERS_RISK evidence edges were recorded.",
        ))

    if not trace.tool_calls:
        issues.append(EvaluationIssue(
            level="warning",
            code="NO_TOOL_CALLS",
            message="No tool calls were made during this agent run.",
        ))

    if not trace.rules_referenced:
        issues.append(EvaluationIssue(
            level="warning",
            code="NO_RULE_REFERENCES",
            message="No risk rules were referenced in this agent run.",
        ))

    # Check for UNKNOWN_RULE in suggestions
    for sug in trace.suggestions:
        if "UNKNOWN_RULE" in (sug.type or "") or "UNKNOWN_RULE" in str(getattr(sug, 'metadata', {})):
            issues.append(EvaluationIssue(
                level="warning",
                code="UNKNOWN_RULE_SUGGESTION",
                message="Trace contains a suggestion with UNKNOWN_RULE — this should be resolved.",
            ))
            break

    # Check for generic data_quality suggestions
    for sug in trace.suggestions:
        if sug.type == "FLAG_DATA_QUALITY_ISSUE" and not getattr(sug, 'metadata', {}).get("missing_field"):
            issues.append(EvaluationIssue(
                level="warning",
                code="GENERIC_DATA_QUALITY_SUGGESTION",
                message="Trace contains a generic data quality suggestion without a specific missing field.",
            ))
            break

    # Check for low relevance (suggestions when question is informational)
    # This is a heuristic: if there are suggestions but the question seems informational
    question_lower = trace.question.lower()
    info_markers = ("what is", "tell me", "explain", "什么是", "是什么", "告诉我")
    if trace.suggestions and any(m in question_lower for m in info_markers):
        issues.append(EvaluationIssue(
            level="info",
            code="LOW_RELEVANCE_SUGGESTION",
            message="Suggestions generated for an informational question — verify relevance.",
        ))

    # -- Labels & overall status -----------------------------------
    labels: dict[str, bool] = {
        "has_tool_calls": len(trace.tool_calls) > 0,
        "has_evidence": has_edges,
        "has_rules": has_rules,
        "has_suggestions": len(trace.suggestions) > 0,
        "answer_grounded": groundedness >= 0.5,
    }

    if any(iss.level == "error" for iss in issues):
        overall_status = "failed"
    elif any(iss.level == "warning" for iss in issues):
        overall_status = "warning"
    else:
        overall_status = "good"

    evaluation = AgentEvaluation(
        evaluation_id=_new_eval_id(),
        trace_id=trace_id,
        agent_run_id=trace.agent_run_id,
        scores=scores,
        labels=labels,
        issues=issues,
        overall_status=overall_status,
        created_at=now,
    )

    # Persist evaluation
    evaluations = load_evaluations()
    evaluations.append(evaluation)
    save_evaluations(evaluations)

    # Link evaluation back to trace
    trace.evaluation_id = evaluation.evaluation_id
    update_trace(trace)

    return evaluation


def get_evaluation(evaluation_id: str) -> AgentEvaluation | None:
    """Return a single evaluation by ID."""
    for e in load_evaluations():
        if e.evaluation_id == evaluation_id:
            return e
    return None


def list_evaluations(limit: int = 50) -> list[AgentEvaluation]:
    """Return most recent evaluations."""
    evaluations = load_evaluations()
    return evaluations[-limit:]


# ── Review Status Updates ─────────────────────────────────────────

def update_trace_review_status(trace_id: str) -> AgentTrace | None:
    """Refresh suggestion statuses from the Review Queue.

    Looks up review items whose IDs are stored in the trace's
    ``review_item_ids`` and maps their statuses back to suggestion traces.
    """
    trace = get_trace(trace_id)
    if trace is None:
        return None

    if not trace.review_item_ids:
        return trace

    # Import here to avoid circular import at module level
    try:
        from review_queue.service import get_review_item
    except ImportError:
        return trace

    # Map review item statuses to suggestion statuses
    status_map = {
        "pending": "submitted_to_review",
        "approved": "applied",
        "applied": "applied",
        "rejected": "rejected",
        "failed": "failed",
    }

    for st in trace.suggestions:
        if st.status in ("applied", "rejected", "failed"):
            # Terminal states — don't overwrite
            continue
        # Find the corresponding review item
        for item_id in trace.review_item_ids:
            item = get_review_item(item_id)
            if item is None:
                continue
            # Match by suggestion_id stored in candidate_object or metadata
            item_suggestion_id = ""
            if item.candidate_object:
                item_suggestion_id = item.candidate_object.get("suggestion_id", "")
            if not item_suggestion_id and hasattr(item, "metadata"):
                item_suggestion_id = item.metadata.get("suggestion_id", "")
            if item_suggestion_id == st.suggestion_id:
                st.status = status_map.get(item.status.value, st.status)
                break

    update_trace(trace)
    return trace


def update_trace_review_info(
    trace_id: str,
    review_batch_id: str,
    review_item_ids: list[str],
) -> None:
    """Store review batch/item IDs back into trace after submission."""
    trace = get_trace(trace_id)
    if trace is None:
        return

    trace.review_batch_id = review_batch_id
    trace.review_item_ids = review_item_ids

    # Mark suggestions as submitted_to_review
    for st in trace.suggestions:
        if st.status == "generated":
            st.status = "submitted_to_review"

    update_trace(trace)

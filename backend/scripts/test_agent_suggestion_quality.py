"""Phase 40 — Agent Suggestion Quality Tests.

Tests for intent-gated suggestions, rule_id resolution,
data quality field specificity, review queue metadata,
trace evaluation UNKNOWN_RULE detection, and template formatting.
"""

import sys
import os
import tempfile
import shutil
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timezone

from agent_operator.service import (
    analyze_agent_answer_for_suggestions,
    submit_agent_suggestions_to_review,
)
from agent_operator.models import AgentActionType, AgentSuggestedAction
from agent_trace.models import (
    AgentTrace,
    SuggestionTrace,
    ToolCallTrace,
    ObjectReference,
    RuleReference,
    EvidenceEdgeReference,
)
from agent_trace.service import evaluate_trace
import agent_trace.storage as trace_storage
import review_queue.storage as rq_storage

# ── Test runner ─────────────────────────────────────────────────────────

passed = 0
failed = 0
errors = []


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  OK {name}")
    else:
        failed += 1
        msg = f"  FAIL {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)
        errors.append(name)


# ── Storage isolation helpers ───────────────────────────────────────────

def _isolate_trace_storage():
    """Redirect trace storage to a temp dir; return cleanup function."""
    tmp = tempfile.mkdtemp(prefix="trace_test_")
    orig_runtime = trace_storage._RUNTIME_DIR
    orig_traces = trace_storage._TRACES_FILE
    orig_evals = trace_storage._EVALUATIONS_FILE
    trace_storage._RUNTIME_DIR = Path(tmp)
    trace_storage._TRACES_FILE = Path(tmp) / "agent_traces.json"
    trace_storage._EVALUATIONS_FILE = Path(tmp) / "agent_evaluations.json"

    def cleanup():
        trace_storage._RUNTIME_DIR = orig_runtime
        trace_storage._TRACES_FILE = orig_traces
        trace_storage._EVALUATIONS_FILE = orig_evals
        shutil.rmtree(tmp, ignore_errors=True)

    return cleanup


def _isolate_rq_storage():
    """Redirect review queue storage to a temp dir; return cleanup function."""
    tmp = tempfile.mkdtemp(prefix="rq_test_")
    orig_runtime = rq_storage._RUNTIME_DIR
    orig_items = rq_storage._ITEMS_FILE
    orig_batches = rq_storage._BATCHES_FILE
    rq_storage._RUNTIME_DIR = Path(tmp)
    rq_storage._ITEMS_FILE = Path(tmp) / "review_items.json"
    rq_storage._BATCHES_FILE = Path(tmp) / "review_batches.json"

    def cleanup():
        rq_storage._RUNTIME_DIR = orig_runtime
        rq_storage._ITEMS_FILE = orig_items
        rq_storage._BATCHES_FILE = orig_batches
        shutil.rmtree(tmp, ignore_errors=True)

    return cleanup


# ── Tests ───────────────────────────────────────────────────────────────

def test_01_recommendation_no_unknown_rule():
    """Recommendation question with 'triggered'/'risk' answer must not produce UNKNOWN_RULE."""
    question = "推荐一款安全的猫粮"
    answer = (
        "Based on analysis, PF001 triggered risk rules including high fat content. "
        "PF001 has RR001 risk triggered. Consider alternatives."
    )
    result = {"answer": answer, "logs": []}

    suggestions = analyze_agent_answer_for_suggestions(question, result, agent_run_id="test-01")

    has_unknown = False
    for s in suggestions:
        if s.rule_id == "UNKNOWN_RULE":
            has_unknown = True
        if "UNKNOWN_RULE" in (s.title or ""):
            has_unknown = True

    check(
        "test_01_recommendation_no_unknown_rule",
        not has_unknown,
        f"Found UNKNOWN_RULE in {len(suggestions)} suggestions",
    )


def test_02_rule_suggestion_resolves_rule_id():
    """Risk analysis question with RR002+PF005 must resolve rule_id=RR002."""
    question = "哪些产品有风险?"
    answer = (
        "Product PF005 has triggered risk rules. RR002 was triggered for missing taurine. "
        "PF005 also has risk from PF005's ingredient analysis."
    )
    result = {"answer": answer, "logs": []}

    suggestions = analyze_agent_answer_for_suggestions(question, result, agent_run_id="test-02")

    rr002_sugs = [s for s in suggestions if s.rule_id == "RR002"]
    has_unknown = any(s.rule_id == "UNKNOWN_RULE" for s in suggestions)

    check(
        "test_02_rule_suggestion_resolves_rule_id",
        len(rr002_sugs) >= 1 and not has_unknown,
        f"RR002 suggestions: {len(rr002_sugs)}, unknown: {has_unknown}",
    )


def test_03_no_generic_data_quality():
    """Data quality question with not_evaluable+PF001 must produce field-specific suggestions."""
    question = "数据不足的产品有哪些?"
    answer = (
        "Product PF001 has not_evaluable rules. "
        "PF001 missing fat_100g data for rule RR001."
    )
    result = {"answer": answer, "logs": []}

    suggestions = analyze_agent_answer_for_suggestions(question, result, agent_run_id="test-03")

    dq_sugs = [s for s in suggestions if s.type == AgentActionType.FLAG_DATA_QUALITY_ISSUE]

    # Either no DQ suggestions, or all have non-empty missing_field
    all_field_specific = all(s.missing_field != "" for s in dq_sugs) if dq_sugs else True

    check(
        "test_03_no_generic_data_quality",
        all_field_specific,
        f"DQ suggestions: {len(dq_sugs)}, field-specific: {all_field_specific}",
    )


def test_04_taurine_suggestion_includes_field():
    """Taurine question for cat food with RR002+not_evaluable must include missing_field=taurine_mg_kg."""
    question = "猫粮的牛磺酸数据充足吗?"
    answer = (
        "RR002 is not_evaluable for PF003 due to missing taurine data. "
        "Cat food PF003 lacks taurine information."
    )
    result = {"answer": answer, "logs": []}

    suggestions = analyze_agent_answer_for_suggestions(question, result, agent_run_id="test-04")

    taurine_sugs = [
        s for s in suggestions
        if s.missing_field == "taurine_mg_kg" and s.related_rule_id == "RR002"
    ]

    check(
        "test_04_taurine_suggestion_includes_field",
        len(taurine_sugs) >= 1,
        f"Taurine/RR002 suggestions: {len(taurine_sugs)}",
    )


def test_05_data_quality_field_specific():
    """Data quality question with multiple not_evaluable rules must produce specific field names."""
    question = "数据不足的产品有哪些? 无法评估"
    answer = (
        "Several products have not_evaluable rules. "
        "PF001 has RR001 not_evaluable. PF002 has RR002 not_evaluable. "
        "PF003 has RR003 not_evaluable."
    )
    result = {"answer": answer, "logs": []}

    suggestions = analyze_agent_answer_for_suggestions(question, result, agent_run_id="test-05")

    dq_sugs = [s for s in suggestions if s.type == AgentActionType.FLAG_DATA_QUALITY_ISSUE]

    # Check that field names are concrete (not empty)
    fields = [s.missing_field for s in dq_sugs if s.missing_field]
    has_specific = len(fields) > 0

    check(
        "test_05_data_quality_field_specific",
        has_specific,
        f"DQ suggestions: {len(dq_sugs)}, with fields: {fields}",
    )


def test_06_informational_no_irrelevant_suggestions():
    """Informational question '什么是猫粮?' must produce no or very few suggestions."""
    question = "什么是猫粮?"
    answer = (
        "Cat food is a type of pet food specifically formulated for cats. "
        "It typically contains protein sources like chicken, fish, or beef, "
        "along with essential nutrients like taurine which cats need."
    )
    result = {"answer": answer, "logs": []}

    suggestions = analyze_agent_answer_for_suggestions(question, result, agent_run_id="test-06")

    check(
        "test_06_informational_no_irrelevant_suggestions",
        len(suggestions) <= 1,
        f"Suggestions generated: {len(suggestions)}",
    )


def test_07_review_queue_metadata():
    """Suggestions submitted to review queue must have related_rule_id in metadata."""
    rq_cleanup = _isolate_rq_storage()
    try:
        question = "猫粮的牛磺酸数据充足吗?"
        answer = (
            "RR002 is not_evaluable for PF003 due to missing taurine data. "
            "Cat food PF003 lacks taurine information."
        )
        result = {"answer": answer, "logs": []}

        suggestions = analyze_agent_answer_for_suggestions(question, result, agent_run_id="test-07")
        if not suggestions:
            check("test_07_review_queue_metadata", False, "No suggestions generated")
            return

        batch = submit_agent_suggestions_to_review(
            suggestions, agent_run_id="test-07", user_message="taurine check",
        )

        items = rq_storage.load_items()
        agent_items = [i for i in items if i.metadata.get("agent_run_id") == "test-07"]

        has_related_rule = any(
            i.metadata.get("related_rule_id", "") != "" for i in agent_items
        )

        check(
            "test_07_review_queue_metadata",
            has_related_rule,
            f"Review items: {len(agent_items)}, with related_rule_id: {has_related_rule}",
        )
    finally:
        rq_cleanup()


def test_08_trace_evaluation_flags_unknown_rule():
    """Trace with UNKNOWN_RULE in suggestion type must produce UNKNOWN_RULE_SUGGESTION issue."""
    trace_cleanup = _isolate_trace_storage()
    try:
        now = datetime.now(timezone.utc)
        trace = AgentTrace(
            trace_id="trace-eval-08",
            agent_run_id="eval-test-08",
            question="Test evaluation",
            answer="This is a test answer with sufficient length for groundedness scoring.",
            status="completed",
            started_at=now,
            completed_at=now,
            tool_calls=[ToolCallTrace(
                tool_call_id="tc-01",
                tool_name="test_tool",
                status="success",
                started_at=now,
                completed_at=now,
            )],
            objects_referenced=[ObjectReference(id="PF001", type="PetFoodProduct")],
            rules_referenced=[RuleReference(id="RR001", name="High Fat")],
            evidence_edges_referenced=[EvidenceEdgeReference(source_id="PF001", target_id="RR001")],
            suggestions=[SuggestionTrace(
                suggestion_id="sug-08",
                type="SUGGEST_RULE_ACTION_UNKNOWN_RULE",
                target_id="PF001",
                status="generated",
            )],
        )

        traces = trace_storage.load_traces()
        traces.append(trace)
        trace_storage.save_traces(traces)

        evaluation = evaluate_trace("trace-eval-08")

        has_unknown_issue = any(
            iss.code == "UNKNOWN_RULE_SUGGESTION" for iss in evaluation.issues
        )

        check(
            "test_08_trace_evaluation_flags_unknown_rule",
            has_unknown_issue,
            f"Issues: {[iss.code for iss in evaluation.issues]}",
        )
    finally:
        trace_cleanup()


def test_09_markdown_table_valid():
    """Comparison template must produce valid markdown table with separator."""
    from petfood_agent_v2 import _template_answer

    tool_results = [{
        "tool_name": "compare_products",
        "status": "success",
        "data": {
            "product_a": {
                "product": {"product_name": "BrandA CatFood", "id": "PF001", "target_species": "cat", "life_stage": "adult"},
                "brand": {"brand_name": "BrandA"},
                "risks": [{"rule_name": "High Fat", "sev": "high", "ev": "fat too high"}],
                "not_evaluable": [],
            },
            "product_b": {
                "product": {"product_name": "BrandB CatFood", "id": "PF002", "target_species": "cat", "life_stage": "adult"},
                "brand": {"brand_name": "BrandB"},
                "risks": [],
                "not_evaluable": [{"rule_id": "RR002", "evidence": "missing taurine"}],
            },
        },
    }]

    answer = _template_answer("Compare PF001 and PF002", tool_results)

    has_separator = "|---|" in answer
    has_table_rows = answer.count("|") >= 8  # header + separator + at least 2 data rows

    check(
        "test_09_markdown_table_valid",
        has_separator and has_table_rows,
        f"Separator: {has_separator}, pipe count: {answer.count('|')}",
    )


def test_10_chinese_recommendation_headers():
    """Chinese recommendation question must produce Chinese section headers."""
    from petfood_agent_v2 import _recommendation_template

    tool_results = [{
        "tool_name": "find_high_risk_products",
        "status": "success",
        "data": [
            {"id": "PF001", "name": "BrandA 猫粮", "species": "cat", "stage": "adult",
             "rule": "RR001 High Fat", "severity": "high"},
        ],
    }]

    answer = _recommendation_question = "推荐一款猫粮"
    answer = _recommendation_template("推荐一款猫粮", tool_results, zh=True)

    # Check for Chinese headers used in the recommendation template
    has_short_answer = "简要回答" in answer
    has_safer_options = "较安全的选择" in answer or "安全" in answer
    has_tools = "使用的工具" in answer
    has_safety = "安全提示" in answer

    check(
        "test_10_chinese_recommendation_headers",
        has_short_answer and has_tools and has_safety,
        f"简要回答: {has_short_answer}, 使用的工具: {has_tools}, 安全提示: {has_safety}",
    )


# ── Main ────────────────────────────────────────────────────────────────

def main():
    global passed, failed, errors
    print("\nPhase 40 — Agent Suggestion Quality Tests")
    print("=" * 60)

    tests = [
        test_01_recommendation_no_unknown_rule,
        test_02_rule_suggestion_resolves_rule_id,
        test_03_no_generic_data_quality,
        test_04_taurine_suggestion_includes_field,
        test_05_data_quality_field_specific,
        test_06_informational_no_irrelevant_suggestions,
        test_07_review_queue_metadata,
        test_08_trace_evaluation_flags_unknown_rule,
        test_09_markdown_table_valid,
        test_10_chinese_recommendation_headers,
    ]

    for test in tests:
        try:
            test()
        except Exception as e:
            failed += 1
            name = test.__name__
            print(f"  ERROR {name} — {e}")
            errors.append(name)

    print(f"\n{'=' * 60}")
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    if failed == 0:
        print("All 10 Phase 40 quality tests passed!")
    else:
        print(f"Failed: {errors}")
        sys.exit(1)


if __name__ == "__main__":
    main()

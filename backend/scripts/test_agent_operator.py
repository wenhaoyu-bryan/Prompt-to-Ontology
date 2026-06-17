"""Tests for Agent Operator — Phase 30."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent_operator.models import (
    AgentActionType,
    AgentOperatorResult,
    AgentSuggestedAction,
    AgentSuggestionBatch,
    AgentSuggestionStatus,
)
from agent_operator.suggestion_builder import (
    build_property_update_suggestion,
    build_link_creation_suggestion,
    build_object_creation_suggestion,
    build_rule_action_suggestion,
    build_data_quality_issue_suggestion,
)
from agent_operator.review_adapter import create_review_items_from_agent_suggestions
from agent_operator.service import analyze_agent_answer_for_suggestions
from review_queue.models import ReviewItem, ReviewItemStatus, ReviewSource, ReviewItemType


def test_01_property_update_suggestion():
    sug = build_property_update_suggestion(
        object_id="PF001", property_name="fat_100g", new_value=18.5,
        old_value=15.0, reason="User requested",
    )
    assert sug.type == AgentActionType.SUGGEST_PROPERTY_UPDATE
    assert sug.target_object_id == "PF001"
    assert sug.property_update is not None
    assert sug.property_update["new_value"] == 18.5
    print("  ✓ test_01_property_update_suggestion")


def test_02_link_creation_suggestion():
    sug = build_link_creation_suggestion(
        source_id="PF001", target_id="ING_CHICKEN", link_type="CONTAINS",
    )
    assert sug.type == AgentActionType.SUGGEST_LINK_CREATION
    assert sug.candidate_link is not None
    assert sug.candidate_link["source_id"] == "PF001"
    assert sug.candidate_link["target_id"] == "ING_CHICKEN"
    print("  ✓ test_02_link_creation_suggestion")


def test_03_object_creation_suggestion():
    sug = build_object_creation_suggestion(
        object_id="NEW001", object_type="Ingredient",
        properties={"name": "Quinoa"},
    )
    assert sug.type == AgentActionType.SUGGEST_OBJECT_CREATION
    assert sug.candidate_object is not None
    assert sug.candidate_object["type"] == "Ingredient"
    print("  ✓ test_03_object_creation_suggestion")


def test_04_rule_action_suggestion():
    sug = build_rule_action_suggestion(
        rule_id="R001", target_object_id="PF003",
        severity="high",
    )
    assert sug.type == AgentActionType.SUGGEST_RULE_ACTION
    assert sug.rule_id == "R001"
    assert sug.severity == "high"
    print("  ✓ test_04_rule_action_suggestion")


def test_05_data_quality_issue_suggestion():
    sug = build_data_quality_issue_suggestion(
        target_object_id="PF005",
        issue_description="Missing taurine data",
        missing_fields=["taurine_mg_kg"],
    )
    assert sug.type == AgentActionType.FLAG_DATA_QUALITY_ISSUE
    assert "PF005" in sug.title
    print("  ✓ test_05_data_quality_issue_suggestion")


def test_06_convert_suggestions_to_review_items():
    suggestions = [
        build_link_creation_suggestion("PF001", "ING001", "CONTAINS"),
        build_property_update_suggestion("PF002", "fat_100g", 18.5),
        build_data_quality_issue_suggestion("PF003", "Missing data"),
    ]
    batch, items = create_review_items_from_agent_suggestions(
        suggestions, agent_run_id="run-test-1", user_message="test",
    )
    assert len(items) == 3
    assert batch.item_count == 3
    assert batch.source_type == ReviewSource.AGENT
    assert items[0].source == ReviewSource.AGENT
    print("  ✓ test_06_convert_suggestions_to_review_items")


def test_07_review_item_type_mapping():
    suggestions = [
        build_link_creation_suggestion("A", "B", "CONTAINS"),
        build_object_creation_suggestion("C", "Ingredient"),
        build_rule_action_suggestion("R1", "D"),
        build_data_quality_issue_suggestion("E", "issue"),
        build_property_update_suggestion("F", "prop", "val"),
    ]
    _, items = create_review_items_from_agent_suggestions(suggestions)

    assert items[0].type == ReviewItemType.IMPORT_LINK_CANDIDATE
    assert items[1].type == ReviewItemType.IMPORT_OBJECT_CANDIDATE
    assert items[2].type == ReviewItemType.RULE_TRIGGERED_ACTION
    assert items[3].type == ReviewItemType.VALIDATION_WARNING
    assert items[4].type == ReviewItemType.AGENT_SUGGESTION
    print("  ✓ test_07_review_item_type_mapping")


def test_08_analyze_property_update_intent():
    result = {"answer": "I will update the fat content.", "logs": []}
    suggestions = analyze_agent_answer_for_suggestions(
        "Set PF001 fat_100g to 18.5", result, agent_run_id="run-1",
    )
    assert len(suggestions) >= 1
    prop_sugs = [s for s in suggestions if s.type == AgentActionType.SUGGEST_PROPERTY_UPDATE]
    assert len(prop_sugs) >= 1
    assert prop_sugs[0].target_object_id == "PF001"
    print("  ✓ test_08_analyze_property_update_intent")


def test_09_analyze_missing_data():
    result = {"answer": "PF003 cannot be evaluated - missing taurine data.", "logs": []}
    suggestions = analyze_agent_answer_for_suggestions(
        "Which products are not evaluable?", result, agent_run_id="run-2",
    )
    dq_sugs = [s for s in suggestions if s.type == AgentActionType.FLAG_DATA_QUALITY_ISSUE]
    assert len(dq_sugs) >= 1
    print("  ✓ test_09_analyze_missing_data")


def test_10_analyze_risk_triggered():
    result = {"answer": "PF001 triggered RR001 high fat risk rule.", "logs": []}
    suggestions = analyze_agent_answer_for_suggestions(
        "Which products are high risk?", result, agent_run_id="run-3",
    )
    rule_sugs = [s for s in suggestions if s.type == AgentActionType.SUGGEST_RULE_ACTION]
    assert len(rule_sugs) >= 1
    print("  ✓ test_10_analyze_risk_triggered")


def test_11_analyze_link_creation_intent():
    result = {"answer": "Adding the relationship.", "logs": []}
    suggestions = analyze_agent_answer_for_suggestions(
        "Add chicken as an ingredient for PF001", result, agent_run_id="run-4",
    )
    link_sugs = [s for s in suggestions if s.type == AgentActionType.SUGGEST_LINK_CREATION]
    assert len(link_sugs) >= 1
    print("  ✓ test_11_analyze_link_creation_intent")


def test_12_no_suggestions_for_normal_query():
    result = {"answer": "PF001 contains chicken, rice, and fish oil.", "logs": []}
    suggestions = analyze_agent_answer_for_suggestions(
        "What ingredients does PF001 contain?", result, agent_run_id="run-5",
    )
    assert len(suggestions) == 0
    print("  ✓ test_12_no_suggestions_for_normal_query")


def test_13_submit_to_review():
    import tempfile, os, shutil
    from pathlib import Path
    import review_queue.storage as storage

    # Isolate storage
    tmp = tempfile.mkdtemp(prefix="agent_test_")
    storage._RUNTIME_DIR = Path(tmp)
    storage._ITEMS_FILE = storage._RUNTIME_DIR / "review_items.json"
    storage._BATCHES_FILE = storage._RUNTIME_DIR / "review_batches.json"

    try:
        from agent_operator.service import submit_agent_suggestions_to_review
        suggestions = [
            build_property_update_suggestion("PF001", "fat_100g", 18.5),
            build_link_creation_suggestion("PF001", "ING001", "CONTAINS"),
        ]
        batch = submit_agent_suggestions_to_review(
            suggestions, agent_run_id="run-test", user_message="test query",
        )
        assert batch.id.startswith("batch-agent-")

        # Verify items persisted
        items = storage.load_items()
        assert len(items) >= 2
        agent_items = [i for i in items if i.source == ReviewSource.AGENT]
        assert len(agent_items) >= 2
        print("  ✓ test_13_submit_to_review")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_14_suggestion_does_not_write_to_graph():
    """Verify suggestions only create review items, not graph mutations."""
    suggestions = [build_link_creation_suggestion("PF001", "ING001", "CONTAINS")]
    batch, items = create_review_items_from_agent_suggestions(suggestions)

    # All items should be pending, none applied
    for item in items:
        assert item.status == ReviewItemStatus.PENDING
        assert item.applied_at is None
    print("  ✓ test_14_suggestion_does_not_write_to_graph")


def test_15_empty_suggestions_raise():
    from agent_operator.service import submit_agent_suggestions_to_review
    try:
        submit_agent_suggestions_to_review([], agent_run_id="run", user_message="q")
        assert False, "Should raise ValueError"
    except ValueError as e:
        assert "no suggestions" in str(e).lower()
        print("  ✓ test_15_empty_suggestions_raise")


# ── Phase 30.5 tests ──────────────────────────────────────────────────

def test_16_unsupported_apply_returns_failed():
    """Unsupported item apply returns status='failed', NOT 'applied'."""
    from review_queue.graph_writer import apply_review_item_to_graph

    item = ReviewItem(
        id="unsup-agent-1",
        type=ReviewItemType.AGENT_SUGGESTION,
        title="Advisory only",
        status=ReviewItemStatus.APPROVED,
        metadata={"agent_action_type": "FLAG_DATA_QUALITY_ISSUE"},
    )
    result = apply_review_item_to_graph(item)
    assert result.applied is False
    assert result.status == "failed"
    assert "not graph-applicable" in result.error.lower()
    print("  ✓ test_16_unsupported_apply_returns_failed")


def test_17_property_update_metadata_on_review_item():
    """Property update suggestion includes correct metadata on review item."""
    sug = build_property_update_suggestion(
        object_id="PF001", property_name="fat_100g", new_value=18.5,
        old_value=15.0, agent_run_id="run-test",
    )
    _, items = create_review_items_from_agent_suggestions([sug], agent_run_id="run-test")
    item = items[0]
    assert item.metadata.get("agent_action_type") == "SUGGEST_PROPERTY_UPDATE"
    assert item.metadata.get("property_update") is not None
    assert item.metadata["property_update"]["object_id"] == "PF001"
    print("  ✓ test_17_property_update_metadata_on_review_item")


def test_18_data_quality_not_graph_applicable():
    """FLAG_DATA_QUALITY_ISSUE is not graph-applicable."""
    from review_queue.graph_writer import apply_review_item_to_graph

    item = ReviewItem(
        id="dq-1",
        type=ReviewItemType.VALIDATION_WARNING,
        title="Missing data",
        status=ReviewItemStatus.APPROVED,
    )
    result = apply_review_item_to_graph(item)
    assert result.applied is False
    assert result.status == "failed"
    print("  ✓ test_18_data_quality_not_graph_applicable")


def test_19_rule_action_not_graph_applicable():
    """RULE_TRIGGERED_ACTION without candidate data is not graph-applicable."""
    from review_queue.graph_writer import apply_review_item_to_graph

    item = ReviewItem(
        id="rule-1",
        type=ReviewItemType.RULE_TRIGGERED_ACTION,
        title="Rule action",
        status=ReviewItemStatus.APPROVED,
    )
    result = apply_review_item_to_graph(item)
    assert result.applied is False
    assert result.status == "failed"
    print("  ✓ test_19_rule_action_not_graph_applicable")


def test_20_incomplete_property_update_fails():
    """Incomplete property_update metadata returns failed."""
    from review_queue.graph_writer import apply_agent_property_update

    item = ReviewItem(
        id="incomplete-1",
        type=ReviewItemType.AGENT_SUGGESTION,
        metadata={"property_update": {"object_id": "PF001"}},  # missing property and new_value
    )
    result = apply_agent_property_update(item)
    assert result.applied is False
    assert result.status == "failed"
    assert "incomplete" in result.error.lower()
    print("  ✓ test_20_incomplete_property_update_fails")


def test_21_coerce_value_preserves_float():
    """Float string '18.5' is coerced to float, not kept as string."""
    from review_queue.graph_writer import _coerce_value
    result = _coerce_value("18.5")
    assert isinstance(result, float)
    assert result == 18.5
    print("  ✓ test_21_coerce_value_preserves_float")


def test_22_coerce_value_preserves_int():
    """Integer string '1200' is coerced to int."""
    from review_queue.graph_writer import _coerce_value
    result = _coerce_value("1200")
    assert isinstance(result, int)
    assert result == 1200
    print("  ✓ test_22_coerce_value_preserves_int")


def test_23_coerce_value_preserves_bool():
    """Boolean strings are coerced to bool."""
    from review_queue.graph_writer import _coerce_value
    assert _coerce_value("true") is True
    assert _coerce_value("false") is False
    assert _coerce_value("True") is True
    print("  ✓ test_23_coerce_value_preserves_bool")


def test_24_coerce_value_keeps_string():
    """Non-numeric strings remain strings."""
    from review_queue.graph_writer import _coerce_value
    result = _coerce_value("chicken")
    assert isinstance(result, str)
    assert result == "chicken"
    print("  ✓ test_24_coerce_value_keeps_string")


def test_25_coerce_value_passthrough_non_string():
    """Non-string values pass through unchanged."""
    from review_queue.graph_writer import _coerce_value
    assert _coerce_value(42) == 42
    assert _coerce_value(3.14) == 3.14
    assert _coerce_value(True) is True
    assert _coerce_value(None) is None
    print("  ✓ test_25_coerce_value_passthrough_non_string")


def main():
    print("\n🧪 Agent Operator Tests")
    print("=" * 50)

    tests = [
        test_01_property_update_suggestion,
        test_02_link_creation_suggestion,
        test_03_object_creation_suggestion,
        test_04_rule_action_suggestion,
        test_05_data_quality_issue_suggestion,
        test_06_convert_suggestions_to_review_items,
        test_07_review_item_type_mapping,
        test_08_analyze_property_update_intent,
        test_09_analyze_missing_data,
        test_10_analyze_risk_triggered,
        test_11_analyze_link_creation_intent,
        test_12_no_suggestions_for_normal_query,
        test_13_submit_to_review,
        test_14_suggestion_does_not_write_to_graph,
        test_15_empty_suggestions_raise,
        test_16_unsupported_apply_returns_failed,
        test_17_property_update_metadata_on_review_item,
        test_18_data_quality_not_graph_applicable,
        test_19_rule_action_not_graph_applicable,
        test_20_incomplete_property_update_fails,
        test_21_coerce_value_preserves_float,
        test_22_coerce_value_preserves_int,
        test_23_coerce_value_preserves_bool,
        test_24_coerce_value_keeps_string,
        test_25_coerce_value_passthrough_non_string,
    ]

    passed = failed = 0
    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            print(f"  ✗ {test.__name__}: {e}")
            failed += 1

    print(f"\n{'=' * 50}")
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    if failed == 0:
        print("✅ All agent operator tests passed!")
    else:
        print("❌ Some tests failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()

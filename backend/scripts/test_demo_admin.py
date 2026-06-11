"""Demo Admin — Smoke Tests"""

import os
import sys
import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from demo_admin import DemoAdminService, DemoState, DemoResetRequest
from demo_admin.models import GraphInfo, ReviewQueueInfo, PipelineInfo, AgentInfo

PASSED = 0
FAILED = 0
TOTAL = 0


def run_test(name, fn):
    global PASSED, FAILED, TOTAL
    TOTAL += 1
    try:
        fn()
        PASSED += 1
        print(f"  ✓ {name}")
    except Exception as e:
        FAILED += 1
        print(f"  ✗ {name}: {e}")


# --- Mock driver ---

def _make_mock_driver(node_count=12, rel_count=30):
    session = MagicMock()
    run_results = [
        MagicMock(single=MagicMock(return_value={"c": node_count})),
        MagicMock(single=MagicMock(return_value={"c": rel_count})),
    ]
    session.run = MagicMock(side_effect=run_results)
    driver = MagicMock()
    driver.session = MagicMock(return_value=MagicMock(__enter__=MagicMock(return_value=session), __exit__=MagicMock()))
    return driver, session


# --- Tests ---

def test_01_state_returns_expected_structure():
    driver, _ = _make_mock_driver(12, 30)
    svc = DemoAdminService(driver=driver)
    with patch.object(svc, '_get_review_info', return_value=ReviewQueueInfo(item_count=5, pending_count=2)):
        with patch.object(svc, '_get_pipeline_info', return_value=PipelineInfo(sample_sources_available=True, import_plan_count=1)):
            with patch.object(svc, '_get_agent_info', return_value=AgentInfo(llm_configured=False)):
                state = svc.get_state()
    assert isinstance(state, DemoState), f"Expected DemoState, got {type(state)}"
    assert state.mode in ("seeded", "clean", "unknown"), f"Unexpected mode: {state.mode}"
    assert state.graph.node_count == 12
    assert state.graph.relationship_count == 30
    assert state.review_queue.pending_count == 2
    assert state.pipeline.import_plan_count == 1


def test_02_seeded_mode_detected_when_nodes_present():
    driver, _ = _make_mock_driver(12, 30)
    svc = DemoAdminService(driver=driver)
    with patch.object(svc, '_get_review_info', return_value=ReviewQueueInfo()):
        with patch.object(svc, '_get_pipeline_info', return_value=PipelineInfo()):
            with patch.object(svc, '_get_agent_info', return_value=AgentInfo()):
                state = svc.get_state()
    assert state.mode == "seeded", f"Expected 'seeded', got '{state.mode}'"


def test_03_clean_mode_detected_when_graph_empty():
    driver, _ = _make_mock_driver(0, 0)
    svc = DemoAdminService(driver=driver)
    with patch.object(svc, '_get_review_info', return_value=ReviewQueueInfo()):
        with patch.object(svc, '_get_pipeline_info', return_value=PipelineInfo()):
            with patch.object(svc, '_get_agent_info', return_value=AgentInfo()):
                state = svc.get_state()
    assert state.mode == "clean", f"Expected 'clean', got '{state.mode}'"
    assert len(state.warnings) > 0, "Expected warning about empty graph"


def test_04_reset_requires_valid_mode():
    driver, _ = _make_mock_driver()
    svc = DemoAdminService(driver=driver)
    try:
        svc.reset("invalid_mode")
        assert False, "Should have raised ValueError"
    except ValueError:
        pass


def test_05_reset_blocked_when_demo_admin_disabled():
    with patch.dict(os.environ, {"DEMO_ADMIN_ENABLED": "false"}):
        assert DemoAdminService.is_enabled() is False, "Expected disabled"


def test_06_reset_allowed_when_demo_admin_enabled():
    with patch.dict(os.environ, {"DEMO_ADMIN_ENABLED": "true"}):
        assert DemoAdminService.is_enabled() is True, "Expected enabled"


def test_07_reset_allowed_by_default():
    with patch.dict(os.environ, {}, clear=True):
        # Remove DEMO_ADMIN_ENABLED if present
        os.environ.pop("DEMO_ADMIN_ENABLED", None)
        assert DemoAdminService.is_enabled() is True, "Expected enabled by default"


def test_08_clear_review_queue():
    with tempfile.TemporaryDirectory() as tmpdir:
        items_file = Path(tmpdir) / "review_items.json"
        batches_file = Path(tmpdir) / "review_batches.json"
        items_file.write_text("[]")
        batches_file.write_text("[]")

        with patch("review_queue.storage._ITEMS_FILE", items_file):
            with patch("review_queue.storage._BATCHES_FILE", batches_file):
                from review_queue.storage import save_items, save_batches, load_items, load_batches
                save_items([])
                save_batches([])
                assert len(load_items()) == 0
                assert len(load_batches()) == 0


def test_09_clean_reset_clears_graph():
    driver, session = _make_mock_driver(12, 30)
    svc = DemoAdminService(driver=driver)

    call_log = []
    def track_run(query, *args, **kwargs):
        call_log.append(query)
        return MagicMock(single=MagicMock(return_value={"c": 0}))

    session.side_effect = None
    session.run = MagicMock(side_effect=track_run)

    with patch.object(svc, '_clear_review_queue'):
        with patch.object(svc, '_clear_pipeline'):
            with patch.object(svc, '_get_review_info', return_value=ReviewQueueInfo()):
                with patch.object(svc, '_get_pipeline_info', return_value=PipelineInfo()):
                    with patch.object(svc, '_get_agent_info', return_value=AgentInfo()):
                        svc.reset("clean")

    delete_calls = [q for q in call_log if "DETACH DELETE" in q]
    assert len(delete_calls) > 0, "Expected DETACH DELETE query"


def test_10_graph_info_on_error():
    driver = MagicMock()
    driver.session = MagicMock(side_effect=Exception("connection refused"))
    svc = DemoAdminService(driver=driver)
    info = svc._get_graph_info()
    assert info.node_count == 0
    assert info.relationship_count == 0


def test_11_seeded_mode_has_no_empty_warning():
    driver, _ = _make_mock_driver(12, 30)
    svc = DemoAdminService(driver=driver)
    with patch.object(svc, '_get_review_info', return_value=ReviewQueueInfo()):
        with patch.object(svc, '_get_pipeline_info', return_value=PipelineInfo()):
            with patch.object(svc, '_get_agent_info', return_value=AgentInfo()):
                state = svc.get_state()
    assert len(state.warnings) == 0, f"Expected no warnings for seeded mode, got: {state.warnings}"


def test_12_demo_state_model_defaults():
    state = DemoState()
    assert state.mode == "unknown"
    assert state.graph.node_count == 0
    assert state.review_queue.item_count == 0
    assert state.pipeline.sample_sources_available is True
    assert state.agent.llm_configured is False
    assert state.last_reset_at is None
    assert state.warnings == []


def test_13_reset_request_model():
    req = DemoResetRequest(mode="seeded", confirm=True)
    assert req.mode == "seeded"
    assert req.confirm is True


def test_14_pipeline_info_when_no_service():
    driver, _ = _make_mock_driver()
    svc = DemoAdminService(driver=driver, pipeline_service=None)
    info = svc._get_pipeline_info()
    assert info.import_plan_count == 0


def test_15_agent_info_fallback_on_error():
    driver, _ = _make_mock_driver()
    svc = DemoAdminService(driver=driver)
    with patch("demo_admin.service.os.environ.get", side_effect=Exception("fail")):
        info = svc._get_agent_info()
    # Should fall back gracefully
    assert isinstance(info, AgentInfo)


# --- Main ---

if __name__ == "__main__":
    print("\n\U0001f9ea Demo Admin Tests")
    print("=" * 50)

    run_test("test_01_state_returns_expected_structure", test_01_state_returns_expected_structure)
    run_test("test_02_seeded_mode_detected_when_nodes_present", test_02_seeded_mode_detected_when_nodes_present)
    run_test("test_03_clean_mode_detected_when_graph_empty", test_03_clean_mode_detected_when_graph_empty)
    run_test("test_04_reset_requires_valid_mode", test_04_reset_requires_valid_mode)
    run_test("test_05_reset_blocked_when_demo_admin_disabled", test_05_reset_blocked_when_demo_admin_disabled)
    run_test("test_06_reset_allowed_when_demo_admin_enabled", test_06_reset_allowed_when_demo_admin_enabled)
    run_test("test_07_reset_allowed_by_default", test_07_reset_allowed_by_default)
    run_test("test_08_clear_review_queue", test_08_clear_review_queue)
    run_test("test_09_clean_reset_clears_graph", test_09_clean_reset_clears_graph)
    run_test("test_10_graph_info_on_error", test_10_graph_info_on_error)
    run_test("test_11_seeded_mode_has_no_empty_warning", test_11_seeded_mode_has_no_empty_warning)
    run_test("test_12_demo_state_model_defaults", test_12_demo_state_model_defaults)
    run_test("test_13_reset_request_model", test_13_reset_request_model)
    run_test("test_14_pipeline_info_when_no_service", test_14_pipeline_info_when_no_service)
    run_test("test_15_agent_info_fallback_on_error", test_15_agent_info_fallback_on_error)

    print("\n" + "=" * 50)
    print(f"Results: {PASSED} passed, {FAILED} failed, {TOTAL} total")
    if FAILED == 0:
        print("✅ All demo admin tests passed!")
    else:
        print(f"❌ {FAILED} test(s) failed!")
        sys.exit(1)

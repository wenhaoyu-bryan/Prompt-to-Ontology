"""Build Scenario — Smoke Tests"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build_scenario import BuildScenarioService, BuildPlan, BuildPlanStage, BuildScenarioDef

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


def test_01_list_scenarios():
    svc = BuildScenarioService()
    scenarios = svc.list_scenarios()
    assert len(scenarios) >= 1, "Expected at least 1 scenario"
    assert any(s.id == "pet_food_full_build" for s in scenarios), "Expected pet_food_full_build scenario"


def test_02_get_scenario():
    svc = BuildScenarioService()
    scenario = svc.get_scenario("pet_food_full_build")
    assert scenario is not None, "Scenario not found"
    assert scenario.name == "Build Full Pet Food Ontology"
    assert len(scenario.sources) == 4
    assert len(scenario.stages) == 4


def test_03_unknown_scenario():
    svc = BuildScenarioService()
    try:
        svc.create_build_plan("nonexistent")
        assert False, "Should have raised ValueError"
    except ValueError:
        pass


def test_04_create_pet_food_build_plan():
    svc = BuildScenarioService()
    plan = svc.create_build_plan("pet_food_full_build")
    assert isinstance(plan, BuildPlan), f"Expected BuildPlan, got {type(plan)}"
    assert plan.scenario_id == "pet_food_full_build"
    assert len(plan.stages) == 4, f"Expected 4 stages, got {len(plan.stages)}"
    assert plan.summary.sources == 4


def test_05_build_plan_has_candidates():
    svc = BuildScenarioService()
    plan = svc.create_build_plan("pet_food_full_build")
    total_objects = sum(len(s.candidate_objects) for s in plan.stages)
    total_links = sum(len(s.candidate_links) for s in plan.stages)
    assert total_objects > 0, "Expected candidate objects"
    assert total_links > 0, "Expected candidate links"


def test_06_build_plan_stages_ordered():
    svc = BuildScenarioService()
    plan = svc.create_build_plan("pet_food_full_build")
    orders = [s.order for s in plan.stages]
    assert orders == sorted(orders), f"Stages not in order: {orders}"
    assert orders[0] == 1  # reference objects first


def test_07_reference_stage_has_brand():
    svc = BuildScenarioService()
    plan = svc.create_build_plan("pet_food_full_build")
    ref_stage = next(s for s in plan.stages if s.stage_id == "reference_objects")
    types = set(ref_stage.object_types)
    assert "Brand" in types, "Reference stage should include Brand"
    assert "Species" in types
    assert "LifeStage" in types


def test_08_relationship_stage_has_links():
    svc = BuildScenarioService()
    plan = svc.create_build_plan("pet_food_full_build")
    rel_stage = next(s for s in plan.stages if s.stage_id == "relationships")
    assert len(rel_stage.candidate_links) > 0, "Relationship stage should have links"
    assert "MADE_BY" in rel_stage.link_types


def test_09_build_plan_saved():
    svc = BuildScenarioService()
    plan = svc.create_build_plan("pet_food_full_build")
    retrieved = svc.get_build_plan(plan.id)
    assert retrieved is not None, "Build plan should be saved"
    assert retrieved.id == plan.id


def test_10_list_build_plans():
    svc = BuildScenarioService()
    plans = svc.list_build_plans()
    assert len(plans) >= 1, "Expected at least 1 build plan"


def test_11_submit_to_review():
    svc = BuildScenarioService()
    plan = svc.create_build_plan("pet_food_full_build")
    result = svc.submit_to_review(plan.id)
    assert "batch_id" in result, "Expected batch_id in result"
    assert result["items_created"] > 0, "Expected items created"
    assert result["stages"] == 4

    # Verify plan state updated
    updated = svc.get_build_plan(plan.id)
    assert updated.submitted_to_review is True
    assert updated.review_batch_id is not None


def test_12_cannot_submit_twice():
    svc = BuildScenarioService()
    plan = svc.create_build_plan("pet_food_full_build")
    svc.submit_to_review(plan.id)
    try:
        svc.submit_to_review(plan.id)
        assert False, "Should have raised ValueError for double submit"
    except ValueError:
        pass


def test_13_build_plan_has_validation_summary():
    svc = BuildScenarioService()
    plan = svc.create_build_plan("pet_food_full_build")
    assert plan.validation is not None
    assert isinstance(plan.validation.cross_source_errors, list)
    assert isinstance(plan.validation.cross_source_warnings, list)


def test_14_evidence_stage_has_triggers_risk():
    svc = BuildScenarioService()
    plan = svc.create_build_plan("pet_food_full_build")
    evidence_stage = next(s for s in plan.stages if s.stage_id == "rule_evidence")
    assert "TRIGGERS_RISK" in evidence_stage.link_types


def test_15_build_plan_summary_counts():
    svc = BuildScenarioService()
    plan = svc.create_build_plan("pet_food_full_build")
    obj_count = sum(len(s.candidate_objects) for s in plan.stages)
    link_count = sum(len(s.candidate_links) for s in plan.stages)
    assert plan.summary.total_candidate_objects == obj_count
    assert plan.summary.total_candidate_links == link_count


# --- Main ---

if __name__ == "__main__":
    print("\n\U0001f9ea Build Scenario Tests")
    print("=" * 50)

    run_test("test_01_list_scenarios", test_01_list_scenarios)
    run_test("test_02_get_scenario", test_02_get_scenario)
    run_test("test_03_unknown_scenario", test_03_unknown_scenario)
    run_test("test_04_create_pet_food_build_plan", test_04_create_pet_food_build_plan)
    run_test("test_05_build_plan_has_candidates", test_05_build_plan_has_candidates)
    run_test("test_06_build_plan_stages_ordered", test_06_build_plan_stages_ordered)
    run_test("test_07_reference_stage_has_brand", test_07_reference_stage_has_brand)
    run_test("test_08_relationship_stage_has_links", test_08_relationship_stage_has_links)
    run_test("test_09_build_plan_saved", test_09_build_plan_saved)
    run_test("test_10_list_build_plans", test_10_list_build_plans)
    run_test("test_11_submit_to_review", test_11_submit_to_review)
    run_test("test_12_cannot_submit_twice", test_12_cannot_submit_twice)
    run_test("test_13_build_plan_has_validation_summary", test_13_build_plan_has_validation_summary)
    run_test("test_14_evidence_stage_has_triggers_risk", test_14_evidence_stage_has_triggers_risk)
    run_test("test_15_build_plan_summary_counts", test_15_build_plan_summary_counts)

    print("\n" + "=" * 50)
    print(f"Results: {PASSED} passed, {FAILED} failed, {TOTAL} total")
    if FAILED == 0:
        print("✅ All build scenario tests passed!")
    else:
        print(f"❌ {FAILED} test(s) failed!")
        sys.exit(1)

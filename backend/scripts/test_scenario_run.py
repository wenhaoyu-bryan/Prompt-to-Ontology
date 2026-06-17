"""Phase 41 — Scenario Run Tests"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scenario_run import (
    list_predefined_scenarios, create_run, list_runs, get_run,
    start_step, complete_step, skip_step, attach_artifact, complete_run,
    get_demo_health,
)

passed = 0
failed = 0
errors = []

def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        print(f"  ✗ {name} {detail}")
        errors.append(name)

print("Phase 41 — Scenario Run Tests")
print("=" * 60)

# 1. list predefined scenarios
scenarios = list_predefined_scenarios()
check("01 list scenarios returns non-empty", len(scenarios) > 0)
check("02 golden_demo_pet_food exists", any(s.scenario_id == "golden_demo_pet_food" for s in scenarios))

# 3. create golden demo run
run = create_run("golden_demo_pet_food")
check("03 create run succeeds", run is not None)
check("04 run has scenario_id", run.scenario_id == "golden_demo_pet_food")

# 5. run has expected steps
check("05 run has steps", len(run.steps) > 0)
check("06 run has 12 steps", len(run.steps) == 12)

# 7. start step updates status
run = start_step(run.run_id, run.steps[0].step_id)
check("07 start step sets running", run.steps[0].status == "running")
check("08 run status is running", run.status == "running")

# 9. complete step updates status and current_step_id
first_step_id = run.steps[0].step_id
run = complete_step(run.run_id, first_step_id, "Graph populated")
check("09 complete step sets completed", run.steps[0].status == "completed")
check("10 current_step_id advanced", run.current_step_id != first_step_id)

# 11. skip step works
second_step_id = run.steps[1].step_id
run = skip_step(run.run_id, second_step_id)
check("11 skip step sets skipped", run.steps[1].status == "skipped")

# 12. attach artifact works
run = attach_artifact(run.run_id, "agent_trace_id", "trace-test-123")
check("12 attach artifact works", run.artifacts.agent_trace_id == "trace-test-123")

# 13. complete run works
run = complete_run(run.run_id)
check("13 complete run sets completed", run.status == "completed")

# 14. list runs returns recent run
runs = list_runs()
check("14 list runs returns runs", len(runs) > 0)
check("15 recent run matches", runs[-1].run_id == run.run_id)

# 16. demo health returns expected keys
health = get_demo_health()
check("16 health has graph_ready", "graph_ready" in health)
check("17 health has rule_studio_ready", "rule_studio_ready" in health)
check("18 health has warnings list", isinstance(health.get("warnings"), list))

print("=" * 60)
print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
if errors:
    print("Failed:", errors)
else:
    print("All tests passed!")

"""Smoke test for Rule Studio module."""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rule_studio import list_rules, get_rule_detail, get_evaluation_summary, simulate_rule
from rule_studio.models import SimulationRequest

passed = 0
failed = 0


def check(name: str, condition: bool, detail: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name} {detail}")


print("=" * 60)
print("Rule Studio — Smoke Test")
print("=" * 60)

# ── 1. list_rules returns all 5 rules ─────────────────────────────────
print("\n[1] List Rules")
rules = list_rules()
check("list_rules returns a list", isinstance(rules, list))
check("list_rules returns 5 rules", len(rules) == 5, f"got {len(rules)}")

# ── 2. Each rule has required fields ──────────────────────────────────
print("\n[2] Rule Fields")
for r in rules:
    check(
        f"Rule {r.id} has name",
        hasattr(r, "name") and bool(r.name),
        f"name={getattr(r, 'name', None)}",
    )
    check(
        f"Rule {r.id} has severity",
        hasattr(r, "severity") and bool(r.severity),
        f"severity={getattr(r, 'severity', None)}",
    )
    check(
        f"Rule {r.id} has condition_type",
        hasattr(r, "condition_type") and bool(r.condition_type),
        f"condition_type={getattr(r, 'condition_type', None)}",
    )
    check(
        f"Rule {r.id} has required_fields",
        hasattr(r, "required_fields") and isinstance(r.required_fields, list),
        f"required_fields={getattr(r, 'required_fields', None)}",
    )

# ── 3. get_rule_detail returns logic_explanation ──────────────────────
print("\n[3] Rule Detail — logic_explanation")
detail = get_rule_detail("RR001")
check("get_rule_detail returns RuleDetail", detail is not None)
check(
    "logic_explanation is a dict",
    isinstance(detail.logic_explanation, dict),
    f"type={type(detail.logic_explanation)}",
)
check(
    "logic_explanation has plain_english",
    "plain_english" in detail.logic_explanation,
)

# ── 4. get_rule_detail returns examples for all 4 statuses ────────────
print("\n[4] Rule Detail — examples")
check("examples is a dict", isinstance(detail.examples, dict))
for status in ("triggered", "passed", "not_evaluable", "not_applicable"):
    check(
        f"examples has {status}",
        status in detail.examples,
        f"keys={list(detail.examples.keys())}",
    )

# ── 5. Simulate triggered case (fat_100g=22 for RR001) ───────────────
print("\n[5] Simulation — triggered")
req_triggered = SimulationRequest(
    rule_id="RR001",
    properties={"fat_100g": 22},
)
sim_triggered = simulate_rule(req_triggered)
check("triggered simulation returns result", sim_triggered is not None)
check(
    "status is triggered",
    sim_triggered.status == "triggered",
    f"status={sim_triggered.status}",
)
check(
    "would_generate_evidence is True",
    sim_triggered.would_generate_evidence is True,
)

# ── 6. Simulate passed case (fat_100g=10 for RR001) ──────────────────
print("\n[6] Simulation — passed")
req_passed = SimulationRequest(
    rule_id="RR001",
    properties={"fat_100g": 10},
)
sim_passed = simulate_rule(req_passed)
check(
    "status is passed",
    sim_passed.status == "passed",
    f"status={sim_passed.status}",
)
check(
    "would_generate_evidence is False",
    sim_passed.would_generate_evidence is False,
)

# ── 7. Simulate not_evaluable case (missing fat_100g for RR001) ──────
print("\n[7] Simulation — not_evaluable")
req_missing = SimulationRequest(
    rule_id="RR001",
    properties={},
)
sim_missing = simulate_rule(req_missing)
check(
    "status is not_evaluable",
    sim_missing.status == "not_evaluable",
    f"status={sim_missing.status}",
)
check(
    "missing_fields includes fat_100g",
    "fat_100g" in sim_missing.missing_fields,
    f"missing_fields={sim_missing.missing_fields}",
)

# ── 8. Simulate not_applicable case (species=Dog for RR002 Cat rule) ─
print("\n[8] Simulation — not_applicable")
req_na = SimulationRequest(
    rule_id="RR002",
    properties={"species": "Dog"},
)
sim_na = simulate_rule(req_na)
check(
    "status is not_applicable",
    sim_na.status == "not_applicable",
    f"status={sim_na.status}",
)

# ── 9. Simulation does not write to graph ─────────────────────────────
print("\n[9] Simulation — no graph mutation")
try:
    from neo4j_connector import get_driver
    import os

    drv = get_driver()
    # Use env credentials for test context
    with drv.session() as s:
        count_before = s.run("MATCH (n) RETURN count(n) AS c").single()["c"]

    # Run a triggered simulation
    simulate_rule(SimulationRequest(rule_id="RR001", properties={"fat_100g": 22}))

    with drv.session() as s:
        count_after = s.run("MATCH (n) RETURN count(n) AS c").single()["c"]

    check(
        "node count unchanged after simulation",
        count_before == count_after,
        f"before={count_before} after={count_after}",
    )
except Exception as e:
    if "Unauthorized" in str(e) or "credentials" in str(e):
        print(f"  SKIP  node count check (Neo4j auth not configured in test context)")
    else:
        check("node count unchanged after simulation", False, str(e))

# ── 10. Evaluation summary returns four-state counts ──────────────────
print("\n[10] Evaluation Summary")
try:
    summary = get_evaluation_summary()
    check("summary is not None", summary is not None)
    check(
        "summary has triggered count",
        hasattr(summary.summary, "triggered"),
    )
    check(
        "summary has passed count",
        hasattr(summary.summary, "passed"),
    )
    check(
        "summary has not_evaluable count",
        hasattr(summary.summary, "not_evaluable"),
    )
    check(
        "summary has not_applicable count",
        hasattr(summary.summary, "not_applicable"),
    )
    check(
        "by_rule has entries",
        isinstance(summary.by_rule, list) and len(summary.by_rule) == 5,
        f"got {len(summary.by_rule) if isinstance(summary.by_rule, list) else 'not a list'}",
    )
except Exception as e:
    if "Unauthorized" in str(e) or "credentials" in str(e):
        print(f"  SKIP  evaluation summary (Neo4j auth not configured in test context)")
    else:
        check("evaluation summary", False, str(e))

# ── Summary ────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
total = passed + failed
print(f"Results: {passed}/{total} passed, {failed}/{total} failed")
print("=" * 60)

sys.exit(0 if failed == 0 else 1)

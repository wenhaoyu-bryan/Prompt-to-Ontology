"""Smoke test for Ontology Kernel v2."""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ontology_kernel import (
    load_pet_food_schema,
    validate_graph_payload,
    create_evidence_metadata,
    create_rule_evidence_link,
    RuleEvaluationResult,
    get_schema_version,
    compute_schema_hash,
    compare_schema_versions,
    get_schema_summary,
    get_object_type_summary,
    get_link_type_summary,
    get_rule_summary,
    get_constraint_summary,
)
from ontology_kernel.models import (
    OntologyGraphPayload,
    RuntimeObject,
    RuntimeLink,
    RuleStatus,
    ReviewStatus,
    IssueLevel,
)

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
print("Ontology Kernel v2 — Smoke Test")
print("=" * 60)

# 1. Load schema
print("\n[1] Schema Loading")
schema = load_pet_food_schema()
check("Pet Food schema loads", schema.domain == "pet_food")
check("Object types count is 6", len(schema.object_types) == 6, f"got {len(schema.object_types)}")
check("Link types count is 6", len(schema.link_types) == 6, f"got {len(schema.link_types)}")
check("Rules count is 5", len(schema.rules) == 5, f"got {len(schema.rules)}")
check("Constraints count > 0", len(schema.constraints) > 0, f"got {len(schema.constraints)}")
check("Actions count is 4", len(schema.actions) == 4, f"got {len(schema.actions)}")

# 2. Schema versioning
print("\n[2] Schema Versioning")
version = get_schema_version(schema)
check("Schema version is string", isinstance(version, str) and len(version) > 0)
schema_hash = compute_schema_hash(schema)
check("Schema hash is 16 chars", len(schema_hash) == 16, f"got '{schema_hash}'")
check("Hash is deterministic", compute_schema_hash(schema) == schema_hash)

diff = compare_schema_versions(schema, schema)
check("Self-compare has no changes", len(diff["object_types_added"]) == 0)

# 3. Introspection
print("\n[3] Schema Introspection")
summary = get_schema_summary(schema)
check("Summary has schema_version", "schema_version" in summary)
check("Summary has schema_hash", "schema_hash" in summary)
check("Summary has counts", summary["counts"]["object_types"] == 6)

obj_summary = get_object_type_summary(schema)
check("Object type summary is list", len(obj_summary) == 6)
product = [s for s in obj_summary if s["name"] == "PetFoodProduct"][0]
check("PetFoodProduct has properties", product["property_count"] > 0)
check("PetFoodProduct has connected_links", len(product["connected_links"]) > 0)

link_summary = get_link_type_summary(schema)
check("Link type summary is list", len(link_summary) == 6)

rule_summary = get_rule_summary(schema)
check("Rule summary is list", len(rule_summary) == 5)

constraint_summary = get_constraint_summary(schema)
check("Constraint summary is list", len(constraint_summary) > 0)

# 4. Validation — valid payload
print("\n[4] Validation — Valid Payload")
valid_payload = OntologyGraphPayload(
    nodes=[
        RuntimeObject(id="PF001", type="PetFoodProduct", properties={"product_id": "PF001", "product_name": "Test Food"}),
        RuntimeObject(id="B001", type="Brand", properties={"brand_id": "B001", "brand_name": "TestBrand"}),
    ],
    links=[
        RuntimeLink(source_id="PF001", target_id="B001", type="MADE_BY"),
    ],
)
issues = validate_graph_payload(valid_payload, schema)
critical = [i for i in issues if i.level == IssueLevel.CRITICAL]
errors = [i for i in issues if i.level == IssueLevel.ERROR]
check("Valid payload has no critical issues", len(critical) == 0)
check("Valid payload has no errors", len(errors) == 0, f"got {len(errors)}: {[i.message for i in errors]}")

# 5. Validation — invalid object type
print("\n[5] Validation — Invalid Object Type")
bad_payload = OntologyGraphPayload(
    nodes=[RuntimeObject(id="X1", type="NonExistent", properties={})],
)
issues = validate_graph_payload(bad_payload, schema)
type_errors = [i for i in issues if i.code == "UNKNOWN_OBJECT_TYPE"]
check("Unknown type returns error", len(type_errors) > 0)

# 6. Validation — invalid link source/target
print("\n[6] Validation — Invalid Link")
bad_link_payload = OntologyGraphPayload(
    nodes=[RuntimeObject(id="PF001", type="PetFoodProduct", properties={"product_id": "PF001", "product_name": "Test"})],
    links=[RuntimeLink(source_id="PF001", target_id="MISSING", type="MADE_BY")],
)
issues = validate_graph_payload(bad_link_payload, schema)
target_errors = [i for i in issues if i.code == "LINK_TARGET_NOT_FOUND"]
check("Missing target returns error", len(target_errors) > 0)

# 7. Rule evaluation result
print("\n[7] Rule Evaluation Result")
result = RuleEvaluationResult(
    rule_id="RR001",
    rule_name="high_fat_risk",
    object_id="PF001",
    status=RuleStatus.TRIGGERED,
    severity="high",
    reason="fat_100g > 20",
)
check("Result is triggered", result.is_triggered)
check("Result is resolved", result.is_resolved)

result2 = RuleEvaluationResult(
    rule_id="RR002",
    rule_name="cat_food_missing_taurine",
    object_id="PF001",
    status=RuleStatus.NOT_EVALUABLE,
    missing_fields=["ingredients"],
)
check("Not evaluable is not triggered", not result2.is_triggered)
check("Not evaluable is not resolved", not result2.is_resolved)

result3 = RuleEvaluationResult(
    rule_id="RR003",
    rule_name="chicken_allergy",
    object_id="PF001",
    status=RuleStatus.NOT_APPLICABLE,
    not_applicable_reason="species != cat",
)
check("Not applicable status works", result3.status == RuleStatus.NOT_APPLICABLE)

legacy = result.to_legacy_dict()
check("Legacy dict has status", legacy["status"] == "triggered")

# 8. Evidence metadata
print("\n[8] Evidence Metadata")
evidence = create_evidence_metadata(
    source_type="rule",
    source_id="RR001",
    reason="fat_100g > 20",
    confidence=0.95,
)
check("Evidence has source_type", evidence.source_type == "rule")
check("Evidence has confidence", evidence.confidence == 0.95)
check("Evidence has generated_at", evidence.generated_at is not None)

link = create_rule_evidence_link(
    rule_id="RR001",
    rule_name="high_fat_risk",
    reason="fat_100g > 20",
    severity="high",
)
check("Evidence link has linkType", link["linkType"] == "TRIGGERS_RISK")
check("Evidence link has rule_id", link["rule_id"] == "RR001")
check("Evidence link has evidence_metadata", "evidence_metadata" in link)

# Summary
print("\n" + "=" * 60)
print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
print("=" * 60)
sys.exit(0 if failed == 0 else 1)

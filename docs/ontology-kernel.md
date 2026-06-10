# Ontology Kernel v2

## What Is the Ontology Kernel?

The Ontology Kernel is the domain-agnostic runtime layer between:

```
domain schema + ready data
```

and:

```
objects + links + constraints + rules + evidence + agent tools
```

It takes YAML schema definitions and structured data, normalizes them into typed Python models, validates graph payloads, generates standardized evidence metadata, and exposes schema introspection for the frontend.

## How It Differs from a Knowledge Graph

A knowledge graph stores facts. The Ontology Kernel **operates** on facts:

- **Schema-aware**: knows what object types, link types, and properties exist
- **Constraint-validating**: checks data against schema rules before import
- **Rule-evaluating**: runs domain rules and generates evidence edges
- **Evidence-tracking**: every risk edge carries metadata about how and why it was generated
- **Versionable**: schema can be hashed and compared across versions

## Core Concepts

| Concept | Model | Purpose |
|---|---|---|
| OntologySchema | `OntologySchema` | Top-level schema container |
| Object Type | `ObjectTypeDef` | Defines a class of entities (e.g. PetFoodProduct) |
| Property | `PropertyDef` | Defines a field on an object type |
| Link Type | `LinkTypeDef` | Defines a relationship between two object types |
| Rule | `RuleDef` | Defines a domain rule with condition and output |
| Constraint | `ConstraintDef` | Defines a validation constraint (required, enum, etc.) |
| Action | `ActionTypeDef` | Defines an executable action triggered by rules |
| Runtime Object | `RuntimeObject` | An instance of an object type in the graph |
| Runtime Link | `RuntimeLink` | An instance of a link type in the graph |
| Evidence | `EvidenceMetadata` | Metadata about why a link/edge was generated |
| Validation Issue | `ValidationIssue` | Structured validation error/warning |
| Rule Result | `RuleEvaluationResult` | Result of evaluating a rule against an object |

## Schema Loading

```python
from ontology_kernel import load_pet_food_schema, load_ontology_schema

# Load Pet Food demo schema
schema = load_pet_food_schema()

# Load any domain
schema = load_ontology_schema("supply_chain", "/path/to/ontology/supply_chain/")
```

The loader reads YAML files (`object_types.yaml`, `link_types.yaml`, `rules.yaml`, `action_types.yaml`, `constraints.yaml`) and normalizes them into typed Pydantic models. Missing optional fields are filled with sensible defaults.

## Validation

```python
from ontology_kernel import validate_graph_payload
from ontology_kernel.models import OntologyGraphPayload, RuntimeObject, RuntimeLink

payload = OntologyGraphPayload(
    nodes=[RuntimeObject(id="PF001", type="PetFoodProduct", properties={"product_id": "PF001", "product_name": "Test"})],
    links=[RuntimeLink(source_id="PF001", target_id="B001", type="MADE_BY")],
)

issues = validate_graph_payload(payload, schema)
for issue in issues:
    print(f"[{issue.level.value}] {issue.code}: {issue.message}")
```

Validation checks:
- Object type exists in schema
- Required properties are present
- Enum values are valid
- Primary key exists
- Link type exists
- Source/target nodes exist in payload
- Source/target types match link definition

## Evidence Metadata

Every generated risk edge should carry standardized evidence:

```python
from ontology_kernel import create_rule_evidence_link

edge = create_rule_evidence_link(
    rule_id="RR001",
    rule_name="high_fat_risk",
    reason="fat_100g = 25 > threshold 20",
    severity="high",
)
# Returns dict with: linkType, severity, reason, evidence, rule_id, evidence_metadata
```

## Rule Evaluation Result

The 4-state model:

| Status | Meaning |
|---|---|
| `triggered` | Condition met, risk is active |
| `passed` | Data complete, condition not met |
| `not_evaluable` | Missing data, cannot evaluate |
| `not_applicable` | Rule does not apply (wrong species/stage) |

```python
from ontology_kernel import RuleEvaluationResult
from ontology_kernel.models import RuleStatus

result = RuleEvaluationResult(
    rule_id="RR001",
    rule_name="high_fat_risk",
    object_id="PF001",
    status=RuleStatus.TRIGGERED,
    severity="high",
    reason="fat_100g > 20",
)
```

## Schema Versioning

```python
from ontology_kernel import compute_schema_hash, compare_schema_versions

hash = compute_schema_hash(schema)  # 16-char deterministic hash
diff = compare_schema_versions(old_schema, new_schema)
# Returns: object_types_added, removed, link_types_added, removed, etc.
```

## Schema Introspection

```python
from ontology_kernel import get_schema_summary, get_object_type_summary

summary = get_schema_summary(schema)
# Returns: domain, schema_version, schema_hash, counts, type lists

objects = get_object_type_summary(schema)
# Returns: per-type details with properties, connected links, connected rules
```

## API Integration

The `GET /api/ontology/{domain}/schema` endpoint now includes:

```json
{
  "domain": "pet_food",
  "objectTypes": {...},
  "linkTypes": {...},
  "rules": {...},
  "schema_version": "1.0.0",
  "schema_hash": "a1b2c3d4e5f6g7h8",
  "normalized_summary": {...}
}
```

All existing fields are preserved. The kernel fields are added on top.

## Future Phases

The Ontology Kernel provides the foundation for:

- **Data Pipeline / Ready Data Workbench**: validate incoming data against schema before import
- **Review Queue runtime**: structured validation issues become reviewable items
- **Agent as Ontology Operator**: agent tools can use typed models instead of raw dicts
- **Docker / SaaS deployment**: kernel is a clean Python package with no heavy dependencies

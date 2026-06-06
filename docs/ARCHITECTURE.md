# Architecture

Ontology OS is a ready-data operational ontology runtime. It turns standardized domain objects into an operational ontology with object types, properties, links, constraints, rules, rule evaluations, graph evidence, object views, and agent reasoning.

---

## Data Flow

```
Ready Data Contract
  → Domain Adapter
  → Graph Payload
  → Rule Engine
  → Constraint Validator
  → Neo4j Ontology Graph
  → NetworkX / FastAPI APIs
  → React Workspaces
  → Agent Tool Reasoning
```

---

## 1. Ready Data Contract

The runtime assumes data has already been normalized into objects and links. The standard input is a `{nodes, edges}` JSON payload where each node has a label and properties, and each edge has a type, source, target, and properties.

See [ready-data-contract.md](ready-data-contract.md) for the full specification.

---

## 2. Ontology Schema

The domain schema is defined by YAML files in `ontology/<domain>/`:

| File | Purpose |
|---|---|
| `object_types.yaml` | Object type definitions and properties |
| `link_types.yaml` | Relationship type definitions (from → to) |
| `constraints.yaml` | Validation rules (required fields, enums, ranges) |
| `rules.yaml` | Risk/safety rules with conditions |
| `action_types.yaml` | Available actions per object type |

The schema is loaded by `OntologyRegistry` at startup and used by the rule engine, constraint validator, and frontend.

---

## 3. Rule Engine

Rules evaluate products against conditions defined in YAML. Each rule evaluates to one of four states:

| State | Meaning |
|---|---|
| `triggered` | Condition met — risk edge created |
| `passed` | Data complete, condition not met |
| `not_evaluable` | Missing data — cannot determine |
| `not_applicable` | Wrong species/life_stage — rule does not apply |

Rule condition types:
- `nutrition_threshold` — compare a nutrient value against a threshold
- `ingredient_absence` — check if a required ingredient is missing
- `ingredient_match` — check if a flagged ingredient is present
- `compound` — combine species/life_stage filter with a nutrition check

---

## 4. Constraint Validator

The validator checks incoming data against the schema before import:

- Object types must be defined in `object_types.yaml`
- Required properties must be present
- Enum values must be valid
- Numeric values must be within range
- Link types must be defined in `link_types.yaml`
- Edge directions must match `from → to` definitions
- TRIGGERS_RISK edges must include severity and evidence

---

## 5. Graph Storage

Neo4j stores ontology objects as nodes and relationships as edges. Each node has a label matching its object type. Each edge has a type matching its link type.

Key edge types:

| Edge | From → To |
|---|---|
| `MADE_BY` | Product → Brand |
| `CONTAINS` | Product → Ingredient (with order) |
| `TARGETS_SPECIES` | Product → Species |
| `SUITABLE_FOR` | Product → LifeStage |
| `TRIGGERS_RISK` | Product → RiskRule (severity, evidence, reason) |

---

## 6. Frontend Workspaces

The React frontend provides 4 workspaces:

| Workspace | Purpose |
|---|---|
| **Objects** | Browse products by type, view structured object details |
| **Graph** | Local/global graph visualization with depth and type controls |
| **Schema** | Inspect object types, link types, rules, actions, and health stats |
| **Agent** | Chat interface with graph-grounded tool-calling |

---

## 7. Agent Reasoning

The agent uses tools to retrieve graph evidence and rule evaluations. It operates in two modes:

**LLM mode:** The LLM selects tools, executes them, and composes a grounded answer from the results.

**Deterministic fallback:** A keyword router maps questions to tools, and a template generates the answer.

In both modes, facts must come from tools — the agent never fabricates data. If data is insufficient, the agent explicitly states this rather than claiming a product is safe.

### Tools

| Tool | Purpose |
|---|---|
| `get_product_risk_explanation` | Full risk explanation for a product |
| `get_product_rule_evaluations` | 4-state rule evaluation report |
| `find_products_by_ingredient` | Products containing an ingredient |
| `find_products_without_ingredient` | Products without an ingredient |
| `find_products_by_species` | Products for a species |
| `find_high_risk_products` | All products with triggered risks |
| `find_products_with_not_evaluable_rules` | Products with missing data |
| `compare_products` | Side-by-side product comparison |
| `recommend_alternatives` | Risk-free alternatives |
| `find_cat_foods_missing_taurine` | Cat foods triggering RR002 |

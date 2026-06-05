# Ready Data Contract for Ontology Runtime

> This document defines the standard input contract for plugging a domain into Ontology OS.
> Any domain that satisfies this contract can be loaded, validated, rule-checked, and visualized
> by the engine without code changes.

**Version:** 1.0
**Status:** Reference document — no pipeline, no real data sourcing.

---

## Table of Contents

1. [Domain Schema Files](#1-domain-schema-files)
2. [Graph Payload Contract](#2-graph-payload-contract)
3. [Node Requirements](#3-node-requirements)
4. [Edge Requirements](#4-edge-requirements)
5. [Rule Output Contract](#5-rule-output-contract)
6. [Data Readiness Checklist](#6-data-readiness-checklist)
7. [Pet Food Worked Example](#7-pet-food-worked-example)

---

## 1. Domain Schema Files

Every domain must provide a directory under `ontology/<domain_name>/` containing these five YAML files:

| File | Top-level key | Purpose |
|---|---|---|
| `object_types.yaml` | `object_types` | Define all node types and their properties |
| `link_types.yaml` | `link_types` | Define all edge types, their source and target node types |
| `constraints.yaml` | `constraints` | Required fields, enum values, non-negative fields, relationship constraints |
| `rules.yaml` | `rules` | Domain-specific evaluation rules (risk, compliance, quality) |
| `action_types.yaml` | `action_types` | Available actions that can be triggered from the UI or agent |

### 1.1 object_types.yaml

```yaml
object_types:
  TypeName:
    description: "Human-readable description"
    properties:
      - property_name_1
      - property_name_2
```

Each property is a string name. The system infers types from constraints or actual data values.

### 1.2 link_types.yaml

```yaml
link_types:
  LINK_NAME:
    description: "Human-readable description"
    from: SourceNodeType
    to: TargetNodeType
```

Direction matters: `from` is the source node, `to` is the target node. Edges are directed.

### 1.3 constraints.yaml

```yaml
constraints:
  TypeName:
    required_fields: [field1, field2]
    enums:
      field_name: [value1, value2, value3]
    non_negative_fields: [numeric_field_1, numeric_field_2]
  relationships:
    LINK_NAME:
      from: SourceType
      to: TargetType
```

Constraints are used for data validation before import. `required_fields` must be non-null. `enums` define allowed values. `non_negative_fields` must be >= 0.

### 1.4 rules.yaml

```yaml
rules:
  rule_key:
    name: "Human-readable rule name"
    severity: critical | high | medium | low
    explanation: "Why this rule exists"
    condition:
      type: <condition_type>
      # ... condition-specific fields
```

Four condition types are supported:

| Condition Type | Required Fields | Description |
|---|---|---|
| `nutrition_threshold` | `field`, `operator`, `value` | Compare a numeric property against a threshold |
| `ingredient_absence` | `target_species`, `missing_ingredient` | Check if a required ingredient is missing |
| `ingredient_match` | `match_ingredients` | Check if any flagged ingredient is present |
| `compound` | `target_species`, `life_stage`, `nutrition_threshold` | Multi-factor condition (species + life stage + threshold) |

**Operator values:** `>`, `>=`, `<`, `<=`, `==`, `!=`

**Severity values:** `critical`, `high`, `medium`, `low`

### 1.5 action_types.yaml

```yaml
action_types:
  ActionName:
    description: "What this action does"
    params:
      - param_name_1
      - param_name_2
```

Actions define operations that can be triggered from the frontend or agent (e.g., explain risk, recommend alternative, generate report).

---

## 2. Graph Payload Contract

The engine consumes a **graph payload** — a JSON object with two arrays:

```json
{
  "nodes": [
    {
      "id": "PF001",
      "label": "PetFoodProduct",
      "properties": {
        "product_name": "Example Kibble",
        "target_species": "cat",
        "life_stage": "adult",
        "protein_100g": 35,
        "fat_100g": 12
      }
    }
  ],
  "edges": [
    {
      "source": "PF001",
      "target": "ING001",
      "type": "CONTAINS",
      "properties": {
        "order": 1
      }
    }
  ]
}
```

### 2.1 Field Naming Convention

| Payload field | Schema equivalent | Notes |
|---|---|---|
| `node.label` | `object_types` key | The node type name (e.g. `PetFoodProduct`) |
| `edge.type` | `link_types` key | The relationship type name (e.g. `CONTAINS`, `TRIGGERS_RISK`) |

**Why `label` and `type`?** These names match the Neo4j convention: nodes have labels, edges have types. The engine uses `label` for nodes and `type` for edges as the primary dispatch keys.

**Frontend mapping:** When data reaches the frontend via the graph API, nodes carry both `objectType` and `type` (aliased from `label`), and edges carry both `linkType` and `relationship` (aliased from `type`). The frontend code uses whichever is available:

```javascript
const objType = node.objectType || node.type || '';
const relType = edge.linkType || edge.relationship || '';
```

---

## 3. Node Requirements

Every node in the payload **must** contain:

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | **Yes** | Unique identifier. Used as the MERGE key in Neo4j. Must be stable across imports. |
| `label` | string | **Yes** | Object type name. Must match a key in `object_types.yaml`. |
| `properties` | object | **Yes** | Key-value pairs. May be empty `{}`. |

### 3.1 ID Stability

- IDs must be deterministic — the same logical object must always produce the same ID.
- IDs are global within a dataset (no two nodes of different types can share an ID).
- Recommended format: `{PREFIX}{NUMERIC}` (e.g. `PF001`, `ING015`, `RR003`).

### 3.2 Property Values

- `null` values are **skipped** during Neo4j import (not written as node properties).
- Numeric fields should use consistent units (see [Checklist](#6-data-readiness-checklist)).
- String fields should be pre-trimmed and UTF-8 encoded.

### 3.3 Uniqueness Constraints

Each node type should have one identity property that serves as a business key. The engine creates uniqueness constraints on these pairs:

| Node Type | Identity Property |
|---|---|
| PetFoodProduct | `product_id` |
| Brand | `brand_id` |
| Ingredient | `ingredient_id` |
| RiskRule | `rule_id` |
| Species | `species_id` |
| LifeStage | `stage_id` |

For new domains, declare the identity property in `constraints.yaml` under `required_fields`.

---

## 4. Edge Requirements

Every edge in the payload **must** contain:

| Field | Type | Required | Description |
|---|---|---|---|
| `source` | string | **Yes** | The `id` of the source node. Must exist in the `nodes` array. |
| `target` | string | **Yes** | The `id` of the target node. Must exist in the `nodes` array. |
| `type` | string | **Yes** | Relationship type. Must match a key in `link_types.yaml`. |
| `properties` | object | No | Key-value pairs. May be omitted or empty `{}`. |

### 4.1 Direction

Edges are **directed**. The direction must match the `from`/`to` declaration in `link_types.yaml`:

```yaml
link_types:
  CONTAINS:
    from: PetFoodProduct   # → source
    to: Ingredient          # → target
```

So the edge `source: "PF001", target: "ING001", type: "CONTAINS"` means "PF001 contains ING001".

### 4.2 Self-loops and Duplicates

- Self-loops (`source === target`) are allowed but discouraged.
- Duplicate edges (same source, target, type) are merged in Neo4j (last-write-wins on properties).

---

## 5. Rule Output Contract

The Rule Engine evaluates rules from `rules.yaml` against node properties and generates **risk edges**. These edges are appended to the payload before Neo4j import.

### 5.1 Trigger Edge Shape

```json
{
  "source": "PF001",
  "target": "RR001",
  "type": "TRIGGERS_RISK",
  "properties": {
    "severity": "high",
    "evidence": "fat_100g=25 > 20",
    "reason": "脂肪含量超过 20g/100g 阈值，存在肥胖风险"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `source` | string | Product node ID |
| `target` | string | Rule node ID (e.g. `RR001`) |
| `type` | string | Always `"TRIGGERS_RISK"` |
| `properties.severity` | string | Copied from the rule's `severity` field. Default: `"medium"` |
| `properties.evidence` | string | Auto-generated. Describes the factual trigger (e.g. `"fat_100g=25 > 20"`, `"contains ingredient: chicken"`) |
| `properties.reason` | string | Copied from the rule's `explanation` field (human-readable explanation) |

### 5.2 Evidence Format by Condition Type

| Condition Type | Evidence Example |
|---|---|
| `nutrition_threshold` | `"fat_100g=25 > 20"` |
| `ingredient_absence` | `"target_species=cat, ingredients do not include taurine"` |
| `ingredient_match` | `"contains ingredient: chicken"` |
| `compound` | `"target_species=cat, life_stage=senior, phosphorus_100g=1.2 > 0.8"` |

---

## 6. Data Readiness Checklist

A dataset is considered **ready** for Ontology OS when all of the following hold:

### 6.1 Identity & Structure

- [ ] **Primary keys are stable** — same object always gets the same ID across imports
- [ ] **Object types are identifiable** — every node's `label` matches a declared type in `object_types.yaml`
- [ ] **Relationship direction is explicit** — every edge's `source`/`target` follows the `from`/`to` in `link_types.yaml`

### 6.2 Schema Conformance

- [ ] **Properties match schema** — every property on a node is declared in its type's `properties` list
- [ ] **Enum values are legal** — fields with enum constraints (e.g. `target_species`) use only declared values
- [ ] **Numeric fields are normalized** — all nutrition values use the same unit (e.g. per 100g), no mixed units
- [ ] **Required fields are present** — `constraints.yaml` required fields are non-null on all nodes

### 6.3 Data Quality

- [ ] **Null values have explicit semantics** — a null field means "unknown" or "not applicable", not "forgot to fill in"
- [ ] **Entity names are standardized** — ingredient names, brand names, etc. use consistent casing and spelling (e.g. no `"Chicken"` vs `"chicken"` vs `"CHICKEN"`)
- [ ] **Data source is traceable** — each record can be traced back to its origin (API, CSV, manual entry)

### 6.4 Completeness

- [ ] **All referenced nodes exist** — every edge's source and target IDs are present in the nodes array (no dangling edges)
- [ ] **Rule nodes exist** — for every rule in `rules.yaml`, a corresponding `RiskRule` node is present in the payload
- [ ] **Reference data is included** — Species, LifeStage, and other lookup nodes are present (not just products)

---

## 7. Pet Food Worked Example

The Pet Food Ontology demonstrates every aspect of this contract.

### 7.1 Schema Overview

- **6 object types:** PetFoodProduct, Brand, Ingredient, RiskRule, Species, LifeStage
- **6 link types:** MADE_BY, CONTAINS, TARGETS_SPECIES, SUITABLE_FOR, TRIGGERS_RISK, SIMILAR_TO
- **5 rules:** High Fat Risk, Missing Taurine, Chicken Allergy Risk, Senior Cat High Phosphorus, Low Protein Kitten
- **4 actions:** ExplainProductRisk, RecommendAlternativeProduct, CreateWatchlist, GenerateIngredientReport

### 7.2 Sample Node: PetFoodProduct

```json
{
  "id": "PF001",
  "label": "PetFoodProduct",
  "properties": {
    "product_id": "PF001",
    "barcode": "4000123456789",
    "product_name": "WhiskerPro Adult Cat Chicken",
    "category": "dry food",
    "target_species": "cat",
    "life_stage": "adult",
    "country": "Germany",
    "protein_100g": 35,
    "fat_100g": 12,
    "fiber_100g": 3,
    "moisture_100g": 8,
    "ash_100g": 7,
    "phosphorus_100g": 0.9,
    "calcium_100g": 1.1
  }
}
```

### 7.3 Sample Node: Ingredient

```json
{
  "id": "ING001",
  "label": "Ingredient",
  "properties": {
    "ingredient_id": "ING001",
    "ingredient_name": "Chicken",
    "ingredient_type": "animal_protein",
    "risk_tag": "common_allergen",
    "common_allergen": true
  }
}
```

### 7.4 Sample Edge: CONTAINS

```json
{
  "source": "PF001",
  "target": "ING001",
  "type": "CONTAINS",
  "properties": {
    "order": 1
  }
}
```

This means: "WhiskerPro Adult Cat Chicken contains Chicken as the first ingredient."

### 7.5 Sample Rule: High Fat Risk

```yaml
high_fat_risk:
  name: "High Fat Risk"
  severity: high
  explanation: "脂肪含量超过 20g/100g 阈值，存在肥胖风险"
  condition:
    type: nutrition_threshold
    field: fat_100g
    operator: ">"
    value: 20
```

### 7.6 Sample Trigger Edge: TRIGGERS_RISK

When a product with `fat_100g: 25` is evaluated against the rule above:

```json
{
  "source": "PF003",
  "target": "RR001",
  "type": "TRIGGERS_RISK",
  "properties": {
    "severity": "high",
    "evidence": "fat_100g=25 > 20",
    "reason": "脂肪含量超过 20g/100g 阈值，存在肥胖风险"
  }
}
```

### 7.7 Pet Food Enum Values

From `constraints.yaml`:

| Field | Allowed Values |
|---|---|
| `target_species` | `cat`, `dog`, `cat_or_dog`, `unknown` |
| `life_stage` | `kitten`, `puppy`, `adult`, `senior`, `all_life_stages`, `unknown` |

### 7.8 Sample Dataset Stats

The included sample dataset contains:
- 12 PetFoodProduct nodes
- 3 Brand nodes
- 20 Ingredient nodes
- 5 RiskRule nodes
- 2 Species nodes (Cat, Dog)
- 4 LifeStage nodes (Kitten, Puppy, Adult, Senior)

---

## Appendix: Payload vs Schema Terminology

| Concept | Schema (YAML) | Payload (JSON) | Neo4j | Frontend |
|---|---|---|---|---|
| Object type | `object_types` key | `node.label` | Node label | `node.objectType` or `node.type` |
| Link type | `link_types` key | `edge.type` | Relationship type | `edge.linkType` or `edge.relationship` |
| Identity field | `constraints.required_fields` | `node.properties.<id_field>` | Uniqueness constraint | — |
| Risk severity | `rules.<key>.severity` | `edge.properties.severity` | TRIGGERS_RISK property | Badge color / text |
| Rule explanation | `rules.<key>.explanation` | `edge.properties.reason` | TRIGGERS_RISK property | Risk Explanation section |
| Trigger evidence | (auto-generated) | `edge.properties.evidence` | TRIGGERS_RISK property | Risk Explanation section |

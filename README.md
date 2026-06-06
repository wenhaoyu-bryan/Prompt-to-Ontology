# Pet Food Ontology MVP

> A domain-agnostic ontology engine validated through a pet food nutrition & risk scenario.
> Built on top of [Prompt-to-Ontology](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology) — React + FastAPI + Neo4j + NetworkX.

**Branch:** `pet-food-ontology-mvp`

---

## What Is This?

This branch transforms the original industrial supply-chain demo into a **mini operational ontology** for pet food products. The goal is not to build a pet food app — it's to prove that the same engine can load any domain's schema from YAML, run rules against a knowledge graph, and answer questions with graph-backed evidence.

**The engine is domain-agnostic. Pet food is the validation scenario.**

---

## Architecture

The current system operates as a **Ready Data Ontology Runtime** — it assumes data is already prepared in a standard graph payload format. Data sourcing and transformation (e.g. Open Pet Food Facts scraping, CSV cleaning) are out of scope for the MVP runtime.

```
Domain Config Registry (domain_config.py / domainConfig.js)
    │  Domain-agnostic config: schema paths, types, endpoints
    ▼
Ready Data Contract (docs/ready-data-contract.md)
    │  Standard {nodes, edges} JSON payload
    ▼
Domain Adapter / Transformer
    │  CSV/external data → Graph Payload
    ▼
Rule Engine (YAML Rules → 4-State Evaluation)
    │  triggered / passed / not_evaluable / not_applicable
    ▼
Constraint Validator
    │  Node/edge schema + enum + direction checks
    ▼
Neo4j Ontology Graph (6 Node Types, 6 Edge Types)
    │
    ▼
NetworkX Graph API + FastAPI Backend
    │  30+ REST endpoints
    ▼
LLM Agent (tool-calling + deterministic fallback)
    │  9 tools, evidence-grounded answers
    ▼
React Workspaces (Objects / Graph / Schema / Agent)
```

> **Note:** The transformer (CSV → Graph Payload) is a domain-specific adapter layer, not part of the core runtime. New domains plug in by providing a payload that conforms to the [Ready Data Contract](docs/ready-data-contract.md) and registering in `domain_config.py`.

### Backend

| Component | File | Role |
|---|---|---|
| Domain Config | `backend/domain_config.py` | Domain registry — paths, types, endpoints |
| Ready Data Contract | `docs/ready-data-contract.md` | Standard input specification for any domain |
| Ontology Registry | `backend/ontology_registry.py` | Loads YAML schema definitions |
| Transformer | `backend/domain/petfood_transformer.py` | CSV → Graph payload (domain adapter) |
| Rule Engine | `backend/rule_engine.py` | 4-state rule evaluation (triggered/passed/not_evaluable/not_applicable) |
| Constraint Validator | `backend/constraint_validator.py` | Validates nodes/edges against schema before import |
| Neo4j Writer | `backend/petfood_neo4j.py` | MERGE nodes/edges into Neo4j |
| Graph API | `backend/ontology.py` | NetworkX graph operations |
| Agent v2 | `backend/petfood_agent_v2.py` | LLM tool-calling agent with 9 tools + deterministic fallback |
| Agent (legacy) | `backend/petfood_agent.py` | Keyword routing + evidence-based answers (fallback) |
| Petfood Adapters | `backend/domain/petfood/` | Sample CSV adapter + Open Food Facts adapter skeleton |
| API Server | `backend/main.py` | FastAPI endpoints |

### Frontend

| Component | File | Role |
|---|---|---|
| App Shell | `frontend/src/App.jsx` | 4-tab layout (Objects / Graph / Schema / Agent) |
| Objects Tab | `frontend/src/components/ObjectsTab.jsx` | Product card list + type selector + detail panel |
| Graph Tab | `frontend/src/components/GraphTab.jsx` | Local/global graph with depth & type controls |
| Schema Tab | `frontend/src/components/SchemaTab.jsx` | Object types, link types, rules, actions, health stats |
| Agent Tab | `frontend/src/components/AgentTab.jsx` | Chat interface with selected product context |
| Product View | `frontend/src/components/EntityInspector.jsx` | 5-section structured product view |
| Graph Canvas | `frontend/src/components/D3GraphCanvas.jsx` | D3 force-directed graph on HTML5 Canvas |

---

## Domain Schema

### 6 Object Types

| Type | Description | Key Properties |
|---|---|---|
| `PetFoodProduct` | Pet food product | product_name, category, target_species, life_stage, nutrition values |
| `Brand` | Product brand | brand_name, country |
| `Ingredient` | Food ingredient | ingredient_name, ingredient_type, risk_tag, common_allergen |
| `RiskRule` | Nutrition/safety rule | rule_name, severity, condition |
| `Species` | Target animal species | species_name (Cat, Dog) |
| `LifeStage` | Life stage category | stage_name (Kitten, Puppy, Adult, Senior) |

### 6 Link Types

| Link | From → To | Description |
|---|---|---|
| `MADE_BY` | Product → Brand | Product manufacturer |
| `CONTAINS` | Product → Ingredient | Ingredient composition (with order) |
| `TARGETS_SPECIES` | Product → Species | Target animal species |
| `SUITABLE_FOR` | Product → LifeStage | Appropriate life stage |
| `TRIGGERS_RISK` | Product → RiskRule | Rule violation (severity, evidence, reason) |
| `SIMILAR_TO` | Product → Product | Similarity relationship (planned) |

### 5 Risk Rules (4-State Evaluation)

Each rule evaluates to one of: **triggered** (condition met), **passed** (data complete, not triggered), **not_evaluable** (missing data), **not_applicable** (wrong species/life_stage).

| Rule | Severity | Condition |
|---|---|---|
| High Fat Risk | high | fat > 20g/100g |
| Missing Taurine | critical | Cat food without taurine |
| Chicken Allergy Risk | medium | Contains chicken/chicken meal |
| Senior Cat High Phosphorus | high | Senior cat + phosphorus > 0.8g |
| Low Protein Kitten | high | Kitten food + protein < 30g |

---

## Sample Data

12 products across 3 brands (WhiskerPro, PurrfectHealth, TailWag), covering:
- Cat & dog food
- Dry food, wet food, treats
- All life stages (kitten, puppy, adult, senior)
- 20 ingredients with allergen and risk tagging

Auto-seeded on first backend startup.

---

## Quick Start

### Prerequisites

- Docker (for Neo4j)
- Python 3.10+
- Node.js 18+

### 1. Start Neo4j

```bash
docker run -d --name neo4j-ontology \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/ \
  neo4j:5
```

### 2. Start Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8765 --reload
```

Pet food sample data is auto-imported on first startup.

### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`

---

## Frontend Tabs

### Objects (Default)

Browse products by type. Click a product card to see the structured 5-section view:
- **Header** — name, brand, species, life stage, risk level badge
- **Nutrition** — 7 nutrient bars with risk-highlighted fields
- **Ingredients** — ordered list with allergen flags
- **Risk Explanation** — severity, evidence, reason per triggered rule
- **Rule Evaluation** — 4-state summary (triggered / passed / not_evaluable / not_applicable)
- **Actions** — explain risk, recommend alternative, watchlist, report, compare

### Graph

View local subgraph around a selected object, or switch to global view.
Controls: depth (1/2/3-hop), link type toggles.

### Schema

Full ontology schema overview: object types, link types, rules, actions, health stats, and data source status panel.

### Agent

LLM tool-calling chat interface with deterministic fallback. Shows which tools were used.
Passes selected product context automatically. Data insufficiency is surfaced in answers.

Example queries:
- "这款产品为什么有风险？"
- "哪些产品含 chicken？"
- "哪些猫粮没有 taurine？"
- "哪些产品数据不足无法完整评估？"
- "帮我比较两个产品的风险差异"
- "有没有不含 chicken 的替代产品？"

---

## API Endpoints (Pet Food)

| Method | Path | Description |
|---|---|---|
| GET | `/api/domains` | List all registered domains |
| GET | `/api/domains/default` | Default domain config |
| POST | `/api/pet-food/import-sample` | Import sample data |
| POST | `/api/pet-food/demo/reset-and-import` | Reset + re-import |
| GET | `/api/pet-food/products/{id}/risk-explanation` | Full risk explanation |
| GET | `/api/pet-food/products/{id}/rule-evaluations` | 4-state rule evaluation report |
| POST | `/api/pet-food/agent/chat` | Agent Q&A (LLM tool-calling + fallback) |
| GET | `/api/ontology/pet_food/schema` | YAML schema definition |

---

## Project Structure

```
Prompt-to-Ontology/
├── backend/
│   ├── main.py                    # FastAPI server
│   ├── domain_config.py           # Domain registry
│   ├── ontology.py                # NetworkX graph operations
│   ├── neo4j_connector.py         # Neo4j query layer
│   ├── petfood_neo4j.py           # Pet food Neo4j writer
│   ├── petfood_agent_v2.py        # LLM tool-calling agent (9 tools)
│   ├── petfood_agent.py           # Deterministic agent fallback
│   ├── rule_engine.py             # 4-state rule evaluator
│   ├── constraint_validator.py    # Pre-import schema validation
│   ├── ontology_registry.py       # YAML schema loader
│   └── domain/
│       ├── petfood_transformer.py # CSV → graph payload (legacy)
│       └── petfood/               # Adapter package
│           ├── adapter_base.py    # Abstract adapter interface
│           ├── sample_csv_adapter.py  # Sample CSV adapter
│           ├── open_food_facts_adapter.py  # OFF adapter skeleton
│           ├── normalizer.py      # Field normalization
│           └── inference.py       # Species/life_stage/category inference
├── frontend/
│   └── src/
│       ├── App.jsx                # 4-tab workspace
│       ├── api.js                 # API client
│       ├── domainConfig.js        # Domain config (frontend)
│       └── components/
│           ├── ObjectsTab.jsx     # Product list + detail
│           ├── GraphTab.jsx       # Local/global graph
│           ├── SchemaTab.jsx      # Schema overview
│           ├── AgentTab.jsx       # Chat interface
│           ├── EntityInspector.jsx # Object 360° view
│           └── D3GraphCanvas.jsx  # D3 graph canvas
├── docs/
│   └── ready-data-contract.md     # Standard input contract
├── ontology/
│   └── pet_food/
│       ├── object_types.yaml
│       ├── link_types.yaml
│       ├── rules.yaml
│       ├── action_types.yaml
│       └── constraints.yaml
└── sample-data/
    └── pet-food/
        ├── pet_food_products.csv
        ├── pet_food_ingredients.csv
        ├── product_ingredients.csv
        └── risk_rules.csv
```

---

## Legacy / Experimental Data Pipeline APIs

`backend/main.py` still contains legacy endpoints from the original industrial supply-chain demo and an experimental schema-inference pipeline. These are **not** part of the Pet Food Ontology MVP runtime path:

| Endpoint | Purpose |
|---|---|
| `POST /api/data/import/preview` | Preview CSV/JSON import with validation |
| `POST /api/data/import/{object_type}` | Import data to Neo4j by object type |
| `GET /api/data/export/{object_type}` | Export Neo4j data as JSON |
| `POST /api/data/import/nodes` | Generic node CSV import |
| `POST /api/data/import/edges` | Generic edge CSV import |
| `POST /api/pipeline/infer-schema` | LLM-based single-table schema inference |
| `POST /api/pipeline/infer-schema-multi` | LLM-based multi-table schema inference |
| `POST /api/pipeline/batch-import` | Multi-table UNWIND batch import |
| `GET /api/ontology/schema` | Auto-extract ontology from Neo4j data |

The Pet Food Ontology MVP uses a different, cleaner pipeline:

```
sample-data CSVs → transformer → rule engine → constraint validator → Neo4j
```

New domains should follow the [Ready Data Contract](docs/ready-data-contract.md) and the standard import path above, not the legacy endpoints.

---

## What This Proves

1. **Ready Data Contract** — Any domain can plug in by conforming to a standard `{nodes, edges}` payload format
2. **YAML-driven schema loading** — New domains can reuse the runtime once they provide YAML schema, a ready graph payload, and an optional domain adapter
3. **4-state rule evaluation** — Rules return triggered / passed / not_evaluable / not_applicable, distinguishing "safe" from "data insufficient"
4. **Constraint validation before import** — Node types, enums, edge directions, and TRIGGERS_RISK fields are all checked
5. **LLM tool-calling agent** — 9 graph query tools with LLM planner + deterministic fallback; never fabricates data
6. **Domain config registry** — Backend and frontend driven by `domain_config.py` / `domainConfig.js`, not hardcoded strings
7. **Data adapter pattern** — `backend/domain/petfood/` package with abstract base, normalizer, inference, and Open Food Facts skeleton
8. **Data insufficiency awareness** — Agent and Object View both surface missing-data warnings; no silent false negatives
9. **First validated domain** — Pet Food as the first fully implemented domain; industrial demo remains as legacy context

---

## License

MIT

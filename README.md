# Ontology OS — Pet Food Ontology Demo

A ready-data operational ontology runtime inspired by Palantir-style ontology modeling.

This demo uses pet food products as a validation domain to show how domain objects, links, rules, constraints, graph evidence, and agent reasoning can work together.

> This is not a pet food app.
> This is a ready-data operational ontology runtime demo using Pet Food as the validation domain.

**Branch:** `pet-food-ontology-mvp`

---

## What This Demo Proves

- Domain objects can be modeled as ontology object types
- Relationships can be validated against link definitions
- Rules can generate explainable risk edges
- Missing data can be separated from safe results (4-state evaluation)
- Object views can show evidence, not just properties
- Agents can answer using graph-grounded tools
- The same runtime can be extended to future domains

---

## Demo Flow

1. Open the **Objects** workspace
2. Select a pet food product
3. Review its nutrition, ingredients, risks, and data limitations
4. Switch to **Graph** to inspect its local ontology neighborhood
5. Switch to **Schema** to inspect object types, link types, rules, and actions
6. Ask the **Agent** why the product is risky
7. Review graph evidence, rule evaluation, tools used, and limitations

See [docs/demo-script.md](docs/demo-script.md) for a 60-second walkthrough.

---

## Architecture

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

See [docs/architecture.md](docs/architecture.md) for the full architecture document.

### Backend

| Component | File | Role |
|---|---|---|
| Domain Config | `backend/domain_config.py` | Domain registry — paths, types, endpoints |
| Ontology Registry | `backend/ontology_registry.py` | Loads YAML schema definitions |
| Rule Engine | `backend/rule_engine.py` | 4-state rule evaluation (triggered/passed/not_evaluable/not_applicable) |
| Constraint Validator | `backend/constraint_validator.py` | Validates nodes/edges against schema before import |
| Agent v2 | `backend/petfood_agent_v2.py` | LLM tool-calling agent with 10 tools + deterministic fallback |
| Transformer | `backend/domain/petfood_transformer.py` | CSV → Graph payload (domain adapter) |
| API Server | `backend/main.py` | FastAPI endpoints |

### Frontend

| Component | File | Role |
|---|---|---|
| App Shell | `frontend/src/App.jsx` | 4-tab layout (Objects / Graph / Schema / Agent) |
| Objects Tab | `frontend/src/components/ObjectsTab.jsx` | Product card list + type selector + detail panel |
| Graph Tab | `frontend/src/components/GraphTab.jsx` | Local/global graph with depth & type controls |
| Schema Tab | `frontend/src/components/SchemaTab.jsx` | Object types, link types, rules, actions, health stats |
| Agent Tab | `frontend/src/components/AgentTab.jsx` | Chat interface with selected product context |
| Entity Inspector | `frontend/src/components/EntityInspector.jsx` | 5-section structured product view |

---

## Domain Schema

### 6 Object Types

| Type | Description | Key Properties |
|---|---|---|
| `PetFoodProduct` | Pet food product | product_name, category, target_species, life_stage, nutrition values |
| `Brand` | Pet food brand | brand_name, country |
| `Ingredient` | Food ingredient | ingredient_name, ingredient_type, risk_tag, common_allergen |
| `RiskRule` | Nutrition/ingredient risk rule | rule_name, severity, condition |
| `Species` | Target species | species_name (Cat, Dog) |
| `LifeStage` | Life stage | stage_name (Kitten, Puppy, Adult, Senior) |

### 6 Link Types

| Link | From → To | Description |
|---|---|---|
| `MADE_BY` | Product → Brand | Product is made by a brand |
| `CONTAINS` | Product → Ingredient | Product contains an ingredient |
| `TARGETS_SPECIES` | Product → Species | Product targets a species |
| `SUITABLE_FOR` | Product → LifeStage | Product is suitable for a life stage |
| `TRIGGERS_RISK` | Product → RiskRule | Product triggers a risk rule |
| `SIMILAR_TO` | Product → Product | Similarity between products |

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

## Tech Stack

- React + Vite
- FastAPI
- Neo4j
- NetworkX
- YAML-based ontology schema
- Rule engine with 4-state evaluation
- Constraint validator
- LLM tool-calling agent with deterministic fallback

---

## Safety Boundary

This demo does not provide veterinary diagnosis.

Risk explanations are based only on the current ontology data and demo rules.

If data is missing, the system says that the rule cannot be evaluated rather than claiming the product is safe.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/domains` | List all registered domains |
| GET | `/api/domains/default` | Default domain config |
| GET | `/api/ontology/pet_food/schema` | YAML schema definition |
| GET | `/api/graph` | Full graph data |
| POST | `/api/pet-food/import-sample` | Import sample data |
| GET | `/api/pet-food/products/{id}/risk-explanation` | Full risk explanation |
| GET | `/api/pet-food/products/{id}/rule-evaluations` | 4-state rule evaluation report |
| POST | `/api/pet-food/agent/chat` | Agent Q&A (LLM tool-calling + fallback) |

---

## Project Structure

```
Prompt-to-Ontology/
├── backend/
│   ├── main.py                    # FastAPI server
│   ├── domain_config.py           # Domain registry
│   ├── ontology_registry.py       # YAML schema loader
│   ├── rule_engine.py             # 4-state rule evaluator
│   ├── constraint_validator.py    # Pre-import schema validation
│   ├── petfood_agent_v2.py        # LLM tool-calling agent (10 tools)
│   ├── petfood_neo4j.py           # Pet food Neo4j writer
│   ├── neo4j_connector.py         # Neo4j query layer
│   └── domain/
│       ├── petfood_transformer.py # CSV → graph payload
│       └── petfood/               # Adapter package
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
│   ├── architecture.md            # Runtime architecture
│   ├── demo-script.md             # 60-second demo walkthrough
│   ├── screenshots-checklist.md   # Screenshot checklist
│   ├── ready-data-contract.md     # Standard input contract
│   └── qa-checklist.md            # QA verification checklist
├── ontology/
│   └── pet_food/
│       ├── object_types.yaml
│       ├── link_types.yaml
│       ├── rules.yaml
│       ├── action_types.yaml
│       └── constraints.yaml
├── scripts/
│   └── smoke_test.py              # API smoke test
└── sample-data/
    └── pet-food/
        ├── pet_food_products.csv
        ├── pet_food_ingredients.csv
        ├── product_ingredients.csv
        └── risk_rules.csv
```

---

## License

MIT

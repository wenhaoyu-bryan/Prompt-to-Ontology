# Prompt-to-Ontology · Pet Food Demo

> An enterprise ontology-building workspace that turns domain prompts and structured data into objects, relationships, evidence, schema, and agent-assisted review workflows.

**Branch:** `pet-food-ontology-mvp`

## What This Is

Prompt-to-Ontology is an enterprise AI workspace for building and operating domain ontologies. The Pet Food Demo validates the runtime using a real domain: pet food products, ingredients, brands, species, risk rules, and nutrition regulations.

**Core workflow:**
```
Prompt / Data → Object Extraction → Relationship Mapping → Evidence Grounding
→ Schema Validation → Agent Analysis → Human Review
```

This is **not** a pet food app. It is an ontology runtime that can be extended to any domain (supply chain, food safety, compliance, industrial operations).

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
| App Shell | `frontend/src/App.jsx` | Refine + Ant Design layout with sidebar navigation |
| Dashboard | `frontend/src/pages/dashboard.jsx` | Hero narrative, workflow pipeline, stats, agent runs, reviews |
| Objects | `frontend/src/pages/objects.jsx` | Object table with filters, evidence, risk levels, detail drawer |
| Graph | `frontend/src/pages/graph.jsx` | D3 graph with left filter panel, local/global views, EntityInspector |
| Schema | `frontend/src/pages/schema.jsx` | Tabbed schema view: object types, relationship types, rules, JSON |
| Agent | `frontend/src/pages/agent.jsx` | Chat + run history, LLM config, agent run detail drawer |
| Review Queue | `frontend/src/pages/review.jsx` | HITL workflow: approve/reject/send-to-agent with detail drawer |
| Settings | `frontend/src/pages/settings.jsx` | Theme, language, API config, auth, demo reset |
| Entity Inspector | `frontend/src/legacy/EntityInspector.jsx` | 360° node view: Overview, Links, Impact, Actions |

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

### Frontend
- **React 18** + **Vite 6** + **Refine** (meta-framework) + **Ant Design 6**
- **React Router v6** for routing
- **i18next** for bilingual i18n (English + Chinese, 370 keys)
- **D3.js v7** for graph visualization
- **axios** for API client

### Backend
- **FastAPI** (Python)
- **Neo4j** graph database
- **NetworkX** for graph algorithms
- **YAML-based** ontology schema (object types, link types, rules, actions, constraints)
- **Rule engine** with 4-state evaluation (triggered / passed / not_evaluable / not_applicable)
- **LLM tool-calling agent** with deterministic fallback

## Portfolio Value

This project demonstrates:
- **Ontology-driven AI product design** — structured domain knowledge, not prompt engineering
- **Graph reasoning** — BFS traversal, relationship mapping, impact analysis
- **HITL workflow** — human review for low-confidence extractions and rule violations
- **Enterprise AI workspace** — professional UI with i18n, theming, auth, and error handling
- **Explainable AI** — every risk has evidence, every rule has a 4-state evaluation
- **Domain-agnostic runtime** — same engine works for pet food, supply chain, or compliance

---

## Data Sources

### Real Backend API (FastAPI at :8765)
- Graph data (nodes + links)
- Node details with outgoing/incoming links
- Ontology schema (object types, link types, rules, actions)
- Rule violations from rule engine
- Agent chat with LLM tool-calling
- LLM configuration (runtime)
- Per-product rule evaluations

### Prototype / Mock Data (frontend-only, labeled in UI)
- Agent run history (`src/mocks/agentRuns.js`) — labeled "Demo Data"
- HITL review items (`src/mocks/reviewItems.js`) — labeled "Prototype"

## Screenshots

> Add screenshots for Dashboard, Graph, Agent, and Review Queue.

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

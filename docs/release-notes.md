# Release Notes — Operational Ontology Runtime

**Version:** Pet Food Ontology Demo  
**Branch:** `pet-food-ontology-mvp` (mainline)

---

## What Ships

### Ontology Kernel

Domain-agnostic runtime that loads YAML schema definitions into typed Pydantic models.

- Object types, link types, rules, constraints, actions
- Graph payload validation with structured `ValidationIssue` results
- Evidence metadata standardization for risk edges
- 4-state rule evaluation: triggered / passed / not_evaluable / not_applicable
- Deterministic schema hashing and version comparison
- Schema introspection for API and frontend

### Data Pipeline

Ready Data Workbench for profiling, mapping, and validating data before it enters the graph.

- CSV/sample data profiling with type inference and null-rate analysis
- Field mapping suggestions to ontology object types and properties
- Candidate object and link generation with confidence scores
- Constraint validation against schema
- Import plan generation with batch review workflow
- JSON persistence for import plan history

### Review Queue Runtime

Human-in-the-loop (HITL) workflow for ontology graph mutations.

- Import plans converted to reviewable items (objects, links, validation warnings)
- Pending → approved/rejected → applied/failed lifecycle
- Apply semantics: MERGE/upsert to Neo4j with review metadata
- Agent suggestions flow into the same queue (5 action types)
- Full audit trail: created, approved, rejected, applied, failed timestamps
- Batch operations: apply all approved items in a batch
- JSON file persistence under `backend/.runtime/`

### Agent Operator

Agent as ontology operator — proposes reviewable updates, never directly mutates the graph.

- 5 suggestion types: property update, link creation, object creation, rule action, data quality flag
- Deterministic suggestion generation from agent answers (regex pattern matching)
- Suggestions converted to Review Queue items via review adapter
- Property value type coercion for Neo4j (string → float/int/bool)
- Agent metadata attached to review items (run ID, user message, action type, reason)

### Product Workflow

Two clear user paths through the application:

**Build Ontology:**
```
Data Pipeline → Ontology Manager → Review Queue → Graph Write
```

**Explore / Operate Ontology:**
```
Object Explorer → Graph Explorer → Agent Operator → Review Actions
```

- Sidebar navigation grouped by path (Home / Build / Explore / Operate / Admin)
- Dashboard dual-path hero with CTA buttons per path
- Bilingual i18n (English + Chinese, 400+ keys)

---

## Pet Food Domain

12 products across 3 brands (WhiskerPro, PurrfectHealth, TailWag):
- Cat & dog food, dry/wet/treats, all life stages
- 20 ingredients with allergen and risk tagging
- 6 object types, 6 link types
- 5 risk rules with 4-state evaluation

---

## Tech Stack

| Layer | Technology |
|---|---|
| API | FastAPI (Python) |
| Database | Neo4j |
| Graph Algorithms | NetworkX |
| Frontend | React 18 + Refine + Ant Design 6 + Vite 6 |
| Routing | React Router v6 |
| i18n | i18next (English + Chinese) |
| Graph Viz | D3.js v7 |
| Schema | YAML-based (object types, link types, rules, actions, constraints) |

---

## Current Limitations

- Single-user demo (no multi-user auth)
- Local JSON runtime storage (`backend/.runtime/`)
- No production authentication
- No external data source ingestion (Open Food Facts, etc.)
- No rollback for applied graph writes
- Agent suggestions are deterministic pattern matching (no LLM-based suggestion extraction yet)

# Product Workflow

## Why Two Paths Exist

Prompt-to-Ontology is an operational ontology runtime. It has two clear user journeys:

1. **Build Ontology** — for data operators who bring data into the ontology
2. **Explore / Operate Ontology** — for analysts and AI operators who inspect, reason over, and update the ontology

This separation ensures data quality (nothing enters the graph without review) and operational trust (every mutation has an audit trail).

---

## Build Ontology Path

```
Ready Data → Data Pipeline → Import Plan → Review Queue → Graph Write
```

### 1. Data Pipeline

Profiles CSV/sample data, maps fields to ontology object types and properties, generates candidate objects and links, validates against schema, and produces an Import Plan. Does NOT write to the graph.

### 2. Ontology Manager (Schema)

Defines the ontology structure: object types, properties, link types, rules, constraints, actions, and schema versioning. This is the schema layer that all data must conform to.

### 3. Review Queue

The trust boundary. Import Plans are submitted here as review items. Humans approve or reject each item. Only approved items can be applied to the graph. Every decision is recorded in the audit trail.

### 4. Graph Write

Approved review items are written to Neo4j using MERGE/upsert semantics. Objects and relationships become part of the operational ontology graph.

---

## Explore / Operate Ontology Path

```
Object Explorer → Graph Explorer → Agent Operator → Review Actions
```

### 1. Object Explorer

Search, inspect, and compare ontology objects. View properties, evidence, risk evaluations, and related entities for each object.

### 2. Graph Explorer

Visualize the global evidence network or drill into local neighborhoods. See relationships between products, ingredients, brands, species, and risk rules.

### 3. Agent Operator

Ask natural-language questions about the ontology. The Agent uses graph-grounded tools (not hallucination) to answer. It can also propose reviewable ontology updates: property changes, new links, new objects, rule actions, and data quality flags.

### 4. Review Actions

Agent suggestions flow into the Review Queue. Same approval workflow as the Build path — human review before any graph mutation.

---

## How This Maps to Ontology Concepts

| Layer | Description | Implementation |
|---|---|---|
| Schema layer | Object types, link types, rules, constraints | Ontology Manager |
| Instance layer | Concrete objects and relationships in the graph | Object Explorer, Graph Explorer |
| Evidence layer | Risk evaluations, confidence, audit metadata | Evidence edges, review metadata |
| Action/Review layer | Human approval before graph mutation | Review Queue |
| Agent operator layer | AI-assisted reasoning and suggestion | Agent Operator |

---

## How Pet Food Validates the Runtime

The Pet Food domain (12 products, 20 ingredients, 6 object types, 6 link types, 5 risk rules) is a validation scenario, not the final product. The same runtime can be extended to supply chain, food safety, compliance, or industrial operations.

Key validation points:
- Domain objects can be modeled as ontology types
- Rules generate explainable risk edges with 4-state evaluation
- Missing data is separated from safe results
- Agent answers are grounded in graph evidence
- All mutations pass through human review

---

## Current Limitations

- Single-user demo (no multi-user auth)
- Local JSON runtime storage (`backend/.runtime/`)
- No production authentication
- No external data source ingestion (Open Food Facts, etc.)
- No rollback for applied graph writes
- Agent suggestions are deterministic pattern matching (no LLM-based suggestion extraction yet)

# Demo Script — Prompt-to-Ontology

> 3–5 minute product walkthrough for portfolio presentation

---

## 0:00–0:30 — Problem & Positioning

"Most AI products rely on unstructured prompts and hope the model gets it right. Prompt-to-Ontology takes a different approach: it builds a structured ontology from domain data — objects, relationships, rules, evidence — and then lets agents reason over that structure."

"This Pet Food Demo shows the full workflow: from raw product data to an ontology workspace with graph reasoning, risk rules, and human-in-the-loop review."

---

## 0:30–1:00 — Dashboard

Open the Dashboard.

Show the hero panel:
- "Enterprise ontology-building workspace"
- Workflow pipeline: Prompt → Object Extraction → Relationship Mapping → Evidence Grounding → Schema Validation → Agent Analysis → Human Review

Show the stat cards:
- Ontology Objects, Relationships, Object Types, Relationship Types, Rules, Risk Alerts

Show data source labels:
- Live API tag (real backend data)
- Prototype tag (mock demo data)

"Everything on this dashboard is driven by a real FastAPI backend connected to a Neo4j graph database. The agent run history and review items are prototype data — clearly labeled."

---

## 1:00–1:30 — Objects

Switch to Objects.

Show the object table with filters:
- 6 object types: PetFoodProduct, Brand, Ingredient, RiskRule, Species, LifeStage
- Columns: Name, ID, Type, Evidence, Risk Level, Connections

Click a product row to open the detail drawer.

Show the EntityInspector:
- Overview tab: nutrition panel, ingredient list, risk explanation, rule evaluation, actions
- Links tab: upstream/downstream relationships
- Impact tab: blast radius analysis
- Actions tab: explain risk, recommend alternatives, watchlist, report

"Every object has structured evidence — not just properties, but relationships, risk triggers, and confidence scores."

---

## 1:30–2:00 — Graph

Switch to Graph.

Show the left filter panel:
- View Mode: Local / Global
- Depth: 1-hop / 2-hop
- Relationship type toggles (Brands, Ingredients, Risks, Species, Life Stage)
- Graph stats (visible objects, visible relationships)

Click a node to open EntityInspector in the right drawer.

Switch to Global view to show the full ontology graph.

"The graph is a force-directed D3 visualization. Local view shows the neighborhood around a selected object. You can toggle relationship types to focus on specific connections."

---

## 2:00–2:30 — Schema

Switch to Schema.

Show the tabbed layout:
- Object Types tab: expandable cards with property tables
- Relationship Types tab: source → target mappings
- Rules tab: severity badges, condition types, descriptions
- Actions tab: available actions per object type
- Schema JSON tab: raw ontology definition

Show the stat cards: 6 object types, 6 relationship types, 5 rules, 4 actions

"The schema is defined in YAML and loaded at runtime. It's domain-agnostic — the same engine can load a supply chain schema or a compliance schema."

---

## 2:30–3:30 — Agent

Switch to Agent.

Show the LLM status bar:
- Configured / Deterministic Fallback
- Runtime Config / Environment

Ask a question: "Which cat foods are missing taurine?"

Show the agent response:
- Answer with evidence
- Tools used (graph_query, rule_check)
- LLM tag (LLM / Fallback)

Switch to Run History tab (labeled "Demo Data"):
- Show past runs with status, objects extracted, issues found
- Click a run to see the detail drawer

"The agent uses tool-calling to query the graph, check rules, and build evidence chains. When no LLM is configured, it falls back to deterministic rule-based answers."

---

## 3:30–4:00 — Review Queue

Switch to Review Queue.

Show the tabbed layout: Pending / Approved / Rejected

Show mock review items (labeled "Prototype"):
- Low confidence extraction
- Conflicting property
- New relationship candidate

Click an item to open the detail drawer:
- Type, severity, status, source
- Description
- Suggested action
- Action buttons: Approve, Reject, Send to Agent

Show real violations from the rule engine (no prototype label):
- Rule violations with severity badges

"This is the HITL layer. Low-confidence extractions, conflicting data, and rule violations all surface here for human review. In production, approve/reject actions would persist to the backend."

---

## 4:00–4:30 — Settings & Technical Details

Switch to Settings.

Show:
- Theme toggle (dark/light)
- Primary color picker (5 presets)
- Language switch (English / Chinese)
- API Configuration (base URL, proxy target)
- Auth & Permissions (mock auth, admin role)
- About section (version, tech stack, GitHub link)
- Danger Zone (demo reset)

"The entire UI supports bilingual i18n — 370 translation keys. Theme and language persist in localStorage."

---

## 4:30–5:00 — Closing

"Prompt-to-Ontology demonstrates an ontology-driven approach to AI product design:

1. **Structured knowledge** — not just text, but typed objects with relationships and evidence
2. **Explainable rules** — every risk has a reason, every rule has a 4-state evaluation
3. **Graph reasoning** — BFS traversal, impact analysis, relationship navigation
4. **Agent grounding** — answers come from graph queries, not hallucination
5. **Human review** — low-confidence and conflicts surface for human decision

This is the foundation for enterprise AI products that need to be explainable, auditable, and domain-agnostic."

---

## What Is Real vs Prototype

| Component | Source | Label |
|-----------|--------|-------|
| Graph data (nodes, links) | Real: `GET /api/graph` | — |
| Node details | Real: `GET /api/node/{id}` | — |
| Schema | Real: `GET /api/ontology/pet_food/schema` | — |
| Violations | Real: `GET /api/ontology/violations` | — |
| Agent chat | Real: `POST /api/pet-food/agent/chat` | — |
| LLM config | Real: `GET/POST/DELETE /api/llm/config` | — |
| Agent run history | Prototype | "Demo Data" tag |
| Review HITL actions | Prototype | "Prototype" tag |

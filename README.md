# Prompt-to-Ontology

[![CI](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/actions/workflows/ci.yml)

[Releases](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/releases) · [Release process](docs/releasing.md)

> A learning-by-building project exploring how operational ontologies turn structured data into typed objects, evidence-backed rules, and reviewable agent workflows.

**Status:** Learning project · Runnable reference implementation · Maintenance-focused

![MIT License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.10+-3776ab)
![React](https://img.shields.io/badge/react-18-61dafb)
![FastAPI](https://img.shields.io/badge/fastapi-009688)
![Neo4j](https://img.shields.io/badge/neo4j-5-008CC1)
![Docker Compose](https://img.shields.io/badge/docker--compose-2496ED)

<p align="center">
  <img
    src="media/dashboard.png"
    alt="Prompt-to-Ontology operational ontology runtime dashboard"
    width="100%"
  >
</p>

---

## What This Is

Prompt-to-Ontology is a learning-by-building project about operational ontology platforms. It includes a runnable reference implementation that profiles structured data, maps it to typed objects and relationships, evaluates explicit rules, records evidence, and lets an ontology-grounded Analyst Agent inspect the graph and propose reviewable updates.

The Pet Food demo makes one possible lifecycle concrete: profile data, prepare and review an import plan, explore typed graph objects, evaluate rules, inspect agent traces, and review graph changes through snapshots, diffs, and rollback.

The goal is to make product and architecture questions tangible, not to claim production readiness or feature parity with an enterprise platform.

---

## Learning Goals and Scope

This project explores three questions:

- How do object types, relationships, constraints, rules, and actions give business data operational meaning?
- How can rule results carry explicit evidence and distinguish triggered, passed, not evaluable, and not applicable states?
- How can agents use ontology tools while proposed changes remain reviewable and reversible?

Pet Food is the only domain example included in this repository. The schema-driven components are designed to make other domains possible, but this project does not prove cross-domain or production readiness. The guided demo uses sample data and is not a production deployment.

## Design References

The project learns from publicly documented ontology concepts in [Palantir Foundry](https://www.palantir.com/docs/foundry/ontologies/ontologies-overview) and open-source graph and ontology tooling in [Semantica](https://github.com/semantica-agi/semantica). These are design references; this project does not claim access to vendor internals or feature equivalence.

---

## Why It Matters

- **Fragmented business meaning.** A typed ontology gives structure to objects, relationships, and rules.
- **Hidden rules.** Explicit rule definitions with 4-state evaluation make logic inspectable and simulatable.
- **Unverifiable agent answers.** The Analyst Agent operates through ontology tools and produces traceable evidence edges.
- **Unreviewed model suggestions.** Every proposed update passes through the Review Queue before touching the graph.
- **Untraceable graph changes.** Graph Governance provides snapshot, diff, and rollback.

---

## Core Principles

- Runnable reference — the Pet Food demo makes one end-to-end ontology workflow inspectable
- Schema-first modeling — object types, link types, constraints, rules, and actions are declared in YAML
- Rules produce explicit evidence — 4-state evaluation (triggered / passed / not_evaluable / not_applicable)
- Agents operate through ontology tools — not free-form text generation
- Suggestions require human review — no autonomous graph modification
- Graph changes remain traceable and reversible — snapshots, diffs, and rollback

---

## Product Architecture

```mermaid
flowchart LR
    A[Ready Data / CSV] --> B[Data Pipeline]
    B --> C[Import Plan]
    C --> D[Review Queue]
    D --> E[Graph Runtime]
    E --> F[Object Explorer]
    E --> G[Graph Explorer]
    E --> H[Rule Studio]
    E --> I[Analyst Agent]
    I --> J[Agent Trace]
    J --> K[Reviewable Suggestions]
    K --> D
    E --> L[Graph Governance]
    L --> M[Snapshot / Diff / Rollback]
    N[Demo Center] -.-> A
    N -.-> E
    N -.-> I
    N -.-> D
```

---

## Product Walkthrough

### Data Pipeline and Review Queue

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="media/data-pipeline.png" alt="Data Pipeline">
      <br>
      <strong>Data Pipeline</strong><br>
      Profile structured data, map fields to ontology types, validate candidates, and generate a reviewable import plan.
    </td>
    <td width="50%" valign="top">
      <img src="media/review-queue.png" alt="Review Queue">
      <br>
      <strong>Review Queue</strong><br>
      Approve, reject, and apply proposed ontology changes through a human-in-the-loop workflow.
    </td>
  </tr>
</table>

### Ontology Definition and Runtime Graph

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="media/ontology-manager.png" alt="Ontology Manager">
      <br>
      <strong>Ontology Manager</strong><br>
      Inspect object types, relationship types, rules, actions, constraints, and schema definitions.
    </td>
    <td width="50%" valign="top">
      <img src="media/graph.png" alt="Graph Explorer">
      <br>
      <strong>Graph Explorer</strong><br>
      Explore runtime objects, relationships, rule evidence, and global or local graph views.
    </td>
  </tr>
</table>

### Analyst Agent

<p align="center">
  <img
    src="media/analyst-agent.png"
    alt="Ontology-grounded Analyst Agent"
    width="100%"
  >
</p>

The Analyst Agent answers through ontology tools rather than free-form guessing. It can retrieve objects, query relationships, evaluate rules, inspect evidence, detect data limitations, and propose reviewable updates. The Analyst Agent cannot directly modify the graph — all suggestions pass through the Review Queue.

---

## Demo Video

[![Watch the demo](https://img.youtube.com/vi/XG8USHbZ3oM/0.jpg)](https://youtu.be/XG8USHbZ3oM)

The video walks through data ingestion, ontology construction, human review, graph exploration, rule evaluation, and Analyst Agent operations.

---

## Quick Start

### Docker Compose (Recommended)

```bash
git clone https://github.com/wenhaoyu-bryan/Prompt-to-Ontology.git
cd Prompt-to-Ontology
cp .env.example .env
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8765 |
| Neo4j Browser | http://localhost:7474 |

Default login: `demo` / `demo`

<details>
<summary>Manual Development</summary>

#### Prerequisites

- Docker (for Neo4j)
- Python 3.10+
- Node.js 18+

#### 1. Start Neo4j

```bash
docker run -d --name neo4j-ontology \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/ \
  neo4j:5
```

#### 2. Start Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8765 --reload
```

Pet food sample data is auto-imported on first startup.

#### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

</details>

---

## Guided Demo

**Dashboard → Demo Center → Start Golden Demo**

Quick Demo steps:

1. **Dashboard** — overview of runtime state
2. **Data Pipeline** — profile sample CSV, review mappings, generate import plan
3. **Review Queue** — review candidates, approve or reject, apply to graph
4. **Object Explorer** — browse products, inspect evidence and risk edges
5. **Graph Explorer** — explore the local and global evidence network
6. **Rule Studio** — review rule definitions, coverage, and run simulations
7. **Analyst Agent** — ask natural-language questions, propose reviewable updates
8. **Agent Trace** — inspect structured traces and 5-score evaluations
9. **Graph Governance** — create a snapshot, view diff, test rollback

---

## Feature Matrix

| Feature | Status | Description |
|---|---|---|
| Ontology Manager | ✅ Available | Object types, link types, rules, actions, constraints |
| Data Pipeline | ✅ Available | Profile, map, validate, generate import plans |
| Custom Object CSV | ✅ Available | Upload object CSV with type inference |
| Relationship CSV | ✅ Available | Upload relationship CSV with validation |
| Review Queue | ✅ Available | Human-in-the-loop approve / reject / apply |
| Object Explorer | ✅ Available | Browse and inspect runtime objects |
| Graph Explorer | ✅ Available | Global and local graph views with D3 |
| Rule Studio | ✅ Available | Rule definitions, coverage, simulation |
| Analyst Agent | ✅ Available | Tool-calling agent with deterministic fallback |
| Agent Trace and Evaluation | ✅ Available | Structured traces, 5-score evaluation |
| Graph Governance | ✅ Available | Snapshot, diff, rollback |
| Demo Center | ✅ Available | Guided step-by-step demo experience |
| Docker Compose | ✅ Available | One-command local setup |
| English and Chinese UI | ✅ Available | 400+ translation keys via i18next |

---

## LLM Configuration

The Analyst Agent works in **deterministic fallback mode** by default — no external LLM API key is required. The demo runs without any LLM configuration.

To enable LLM-powered reasoning:

1. Copy `backend/.env.example` to `backend/.env` and set your API key, **or**
2. Configure at runtime via the UI: **Settings → LLM Config**

**Supported providers:** OpenAI, Anthropic, MiniMax

> Never commit `.env` files. They are already in `.gitignore`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 6, Refine, Ant Design 6, React Router v6, i18next, D3.js v7, Playwright |
| Backend | FastAPI, Neo4j 5, NetworkX, YAML schema, 4-state rule engine, tool-calling agent with deterministic fallback |
| Runtime | Docker Compose |

---

## Repository Structure

```
backend/
  ontology_kernel/     Schema-driven runtime and validation
  data_pipeline/       CSV profiling, mapping, import plans
  review_queue/        HITL review workflow
  graph_snapshot/      Snapshot, diff, rollback
  rule_studio/         Rule definitions and simulation
  agent_trace/         Trace and evaluation
  scenario_run/        Guided demo orchestration
frontend/
  pages/               Dashboard, Graph, Agent, Rule Studio, Demo Center, ...
  components/          Layout, navigation
  i18n/                English + Chinese (400+ keys)
  tests/smoke/         Playwright route smoke tests
docs/                  Product docs, architecture, demo scripts
media/                 Screenshots and demo video
ontology/pet_food/     Pet Food domain schema (YAML)
sample-data/           Demo CSV data
```

---

## Testing

Backend: run module checks from `backend/` with `python scripts/test_<module>.py`.

Frontend: `npm run test:smoke` (Playwright route smoke tests).

GitHub Actions runs backend module checks, runs Neo4j integration checks against an ephemeral Neo4j 5 service, and builds the frontend on pushes to `main` and pull requests. The Playwright route smoke tests remain available for local runs.

---

## Project Status

Prompt-to-Ontology is a learning project with a runnable reference implementation. The included Pet Food demo makes the design choices and workflow inspectable.

The repository includes module-level backend test scripts and frontend smoke tests, but does not provide a production deployment, enterprise identity and access management, or validation across multiple business domains. Future work will focus on maintenance, documentation, and small examples that test the learning goals rather than broad platform expansion.

## Contributing

Small, focused contributions are welcome, especially documentation improvements, reproducible bug reports, tests, and self-contained sample domains. For larger feature ideas, open an issue first to check that they fit the project's learning scope.

---

## Disclaimer

This demo does not provide veterinary diagnosis. Risk explanations are based only on the current ontology data and demo rules. If data is missing, the system reports that the rule cannot be evaluated rather than claiming the product is safe.

---

## License

MIT

---

<p align="center">
  <sub>A learning-by-building reference for operational ontologies: structured data → typed graph → rules and evidence → human review → ontology-grounded agent.</sub>
</p>

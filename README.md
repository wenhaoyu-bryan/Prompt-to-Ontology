# Prompt-to-Ontology

Map source data, review graph changes, and trace sample answers to source records.

https://github.com/user-attachments/assets/97bf16a6-b8e2-4364-af25-73ef42201fea

**96-second product demo** · [Download MP4](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/releases/download/v0.3.1/prompt-to-ontology-product-demo.mp4) · [中文](README.zh-CN.md)

[![CI](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Prompt-to-Ontology is an open-source learning project for operational ontologies. Its runnable Pet Food reference connects structured data, typed objects, explicit rules, human review, and an ontology-grounded Analyst Agent.

- **Build from source data.** Profile CSV files, flat JSON arrays, or NDJSON, review field mappings, and prepare candidate objects and relationships.
- **Review before applying.** Inspect proposed changes in an Import Plan and Review Queue, then approve and apply them to the graph.
- **Inspect the evidence.** Follow sample answers through relationship paths, open cited source records, and check for matching runtime relationships.

The workflow starts with a business question, then develops the source mappings and schema needed to inspect it. The included reference uses a single Pet Food sample domain.

## Quick start

Install Git and Docker with Docker Compose v2, then run:

```bash
git clone https://github.com/wenhaoyu-bryan/Prompt-to-Ontology.git
cd Prompt-to-Ontology
cp .env.example .env
docker compose up --build
```

Open **http://localhost:5173** and sign in with **`demo` / `demo`**.

The backend seeds sample data on first startup by default. You can try the Analyst Agent in deterministic fallback mode **without an external LLM API key**.

| Service | Address |
| --- | --- |
| Application | http://localhost:5173 |
| Backend API | http://localhost:8765 |
| Neo4j Browser | http://localhost:7474 |

Run the stack locally on a trusted network. The demo login is a frontend convenience, not backend authentication.

For setup and troubleshooting, see [Local Docker setup](docs/local-docker-setup.md). To configure an external model, open **Settings → LLM Config**. Supported providers include OpenAI, Anthropic, and MiniMax; never commit API keys or `.env` files.

<details>
<summary>Sample data, persistence, and demo write settings</summary>

- Set `AUTO_SEED_DEMO_DATA=false` in `.env` to disable automatic sample seeding.
- Compose stores the source catalog, import plans, and review state in the `backend_runtime` volume. These survive container replacement; an explicit demo reset can clear them.
- Legacy direct-write operations, including demo reset and snapshot restore, return HTTP 403 by default. Enable `ENABLE_LEGACY_DEMO_WRITES=true` only for a disposable local demo, then restart the backend. Use **Import Plan → Review Queue** for the regular build workflow.
- Review Queue demonstrates review decisions and graph application; it is not an authorization boundary.

</details>

## Try the reference workflow

1. **Map a source.** In **Data Pipeline**, select a sample source, inspect its profile, and review field mappings before preparing an Import Plan.
2. **Review a change.** In **Review Queue**, inspect a candidate's properties and audit trail, then approve and apply it. Approval and application are separate actions.
3. **Trace an answer.** In **Verified Questions**, run **Q03: What is PF001's first ingredient?** Inspect the `CONTAINS` path and cited records, then select **Explore in graph** to check the runtime relationship.
4. **Query with ontology tools.** Ask the **Analyst Agent**, “Which products contain chicken?” Inspect the answer and tool used. Proposed updates go through Review Queue.

The reference also includes object and graph exploration, four-state rule evaluation, agent traces, and graph snapshots, diffs, and rollback. Use **Demo Center → Start Golden Demo** for the guided tour.

<details>
<summary>View the workflow screenshots</summary>

### Runtime overview

![Dashboard with the seeded Pet Food runtime](media/dashboard.png)

### Source mapping

![Source column types, missing values, and sample records](media/data-profile.png)

![Source field mappings and review controls](media/data-pipeline.png)

Confirm mappings before preparing candidates. A confirmed mapping records a decision; it does not prove that data is queryable in Neo4j.

### Change review

![Review Queue with a candidate product and its properties](media/review-queue.png)

Inspect a candidate before approval. The recording applies one reviewed product to an already seeded graph, rather than rebuilding the whole graph from scratch.

![PetFoodProduct definition and schema draft controls](media/ontology-manager.png)

Ontology Manager exposes definitions and local edit drafts without changing the active YAML.

### Graph exploration

![Graph Explorer with typed objects and relationship filters](media/graph.png)

Search for an object, inspect its neighborhood, or expand the overview's relationship display.

### Answer evidence

![Q03 answer with a relationship path and cited CSV source records](media/verified-questions.png)

The fixed Q03 answer reads checked-in sample files. Graph Explorer separately checks whether the corresponding relationship exists in the runtime graph.

![PF001 neighborhood with a matching relationship and source evidence](media/graph-evidence.png)

### Analyst Agent

![Deterministic tool query for products containing chicken](media/analyst-agent.png)

The recording shows the answer and tool name in deterministic fallback mode.

</details>

[Product workflow](docs/product-workflow.md) · [Recording notes and additional captures](media/README.md)

## Scope and evaluation

This repository is a learning reference. Production readiness, enterprise identity and access management, and applicability across multiple business domains have not been established.

- **Sample answers and runtime queries are separate.** Verified Questions reads checked-in CSV/YAML files; graph highlighting checks for matching runtime relationships. It does not show that Neo4j computed the sample answer.
- **Agent behavior depends on the configured mode.** The video uses deterministic fallback without an LLM key. Fixed-question regression scores and heuristic trace scores do not measure free-form Agent accuracy.
- **Schema edits remain drafts.** Ontology Manager saves local review drafts; active definitions continue to use checked-in YAML.
- **Rules describe the sample.** Results reflect the available data and configured conditions, not veterinary advice. Missing evidence can make a rule not evaluable.

<details>
<summary>Modeling approach and fixed-question evaluation</summary>

The prompt establishes a decision question and a modeling hypothesis. The workflow then:

1. Profiles source fields, missing values, and source revisions.
2. Proposes object, property, and relationship mappings for human review.
3. Defines types, constraints, rules, and action contracts in YAML.
4. Generates candidate changes through an Import Plan.
5. Reviews and applies candidates, then inspects results and evidence.

The [eight-question v1 set](sample-data/pet-food/question-set.v1.json) is a design baseline with hashed source inputs. The [22-question v2 catalog](sample-data/pet-food/verified-questions.v2.json) supplies bounded read-only query plans. Separate [reference judgments](sample-data/pet-food/verified-gold.v2.json) are read only by the regression evaluator.

Regression evaluation scores conclusion, source evidence, evaluation path, and appropriate abstention separately. It supports rerunning questions affected by changed assets, comparing runs per question, and saving proposed questions as drafts. These checks evaluate the fixed sample reader, not general Agent reliability.

</details>

## Documentation

| Guide | Contents |
| --- | --- |
| [Documentation index](docs/README.md) | Product, architecture, and development guides |
| [Data pipeline](docs/data-pipeline.md) | Source profiling, mapping, and import plans |
| [Review Queue](docs/review-queue-runtime.md) | Review decisions and graph application |
| [Ontology kernel](docs/ontology-kernel.md) | Schema definitions and validation |
| [Analyst Agent](docs/agent-operator.md) | Ontology tools and reviewable suggestions |
| [Agent traces and evaluation](docs/agent-trace-evaluation.md) | Trace inspection and evaluation methods |
| [Graph governance](docs/graph-snapshot-diff-rollback.md) | Snapshots, diffs, and rollback |

**Stack:** React · FastAPI · Neo4j · Sigma.js / Graphology · React Flow · Docker Compose. The application supports English and Chinese.

## Development

Backend unit tests, from the repository root:

```bash
PYTHONPATH=backend python -m unittest discover -s backend/tests
```

Frontend build, from `frontend/`:

```bash
npm ci
npm run build
```

With the local Compose stack running, run `npm run test:smoke -- --workers=1` from `frontend/` for Playwright checks. GitHub Actions also runs backend module and Neo4j integration checks. CI does not deploy the project.

See [Contributing](CONTRIBUTING.md) for development requirements and [Release process](docs/releasing.md) for versioning and publication.

## Design references

The project learns from publicly documented [Palantir Foundry Ontology concepts](https://www.palantir.com/docs/foundry/ontologies/ontologies-overview) and [Semantica](https://github.com/semantica-agi/semantica). These are design references, not claims of access to vendor internals or feature equivalence.

Graph Explorer's layout and exploration interactions are inspired by Semantica's Knowledge Explorer. This project uses Sigma.js and Graphology for the graph view, and React Flow for answer paths.

## Contributing

Reproducible bug reports, documentation improvements, and focused tests are welcome. For larger changes, open an issue to discuss the scope first.

Read the [contribution guide](CONTRIBUTING.md) before submitting a pull request.

## License

[MIT](LICENSE). Third-party media retains its own license; see [music credits](media/README.md#music-credit).

# <img src="frontend/public/brand/ontology-reasoning.png" width="32" height="32" alt="" /> Prompt-to-Ontology

Map source data, review graph changes, and trace sample answers to source records.

https://github.com/user-attachments/assets/cb35e078-3699-43fc-94d3-1f6bfcd70766

**103-second product demo · v0.6.0 · light theme · DeepSeek** · [Download MP4](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/releases/download/v0.6.0/prompt-to-ontology-v0.6.0-demo.mp4) · [中文](README.zh-CN.md)

[![CI](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Prompt-to-Ontology is an open-source ontology workbench for connecting source data, typed objects, explicit rules, human review, and ontology-grounded Agents. The included Pet Food reference provides a runnable example of the workflow.

- **Build with assistance.** Upload CSV files, flat JSON arrays, or NDJSON and describe your goal. Review proposed mappings, resolve ambiguous fields, and preview candidate objects and relationships.
- **Design schema drafts.** Propose object and relationship definitions from source fields, edit them in a list or structure map, and save or export a reviewed draft.
- **Review before applying.** Inspect proposed changes in an Import Plan and Review Queue, then approve and apply them to the graph.
- **Inspect the evidence.** Follow sample answers through relationship paths, open cited source records, and check for matching runtime relationships.
- **Evaluate Agent runs.** Edit evaluation questions, inspect actual answers and tool results, compare runs, and turn feedback into regression cases.

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

For setup and troubleshooting, see [Local Docker setup](docs/local-docker-setup.md). Open **Model configuration** in the sidebar to save OpenAI-compatible or Anthropic connections and assign models separately to assisted build and graph query. Saved keys stay on your backend; Docker preserves them in its runtime volume. Environment variables remain available as a deployment default. See [model setup](docs/question-set-evaluation.md#model-setup).

<details>
<summary>Sample data, persistence, and demo write settings</summary>

- Set `AUTO_SEED_DEMO_DATA=false` in `.env` to disable automatic sample seeding.
- Compose stores source data, import plans, review state, and saved model connections in the `backend_runtime` volume. These survive container replacement. A demo reset clears workflow data; deleting the volume also deletes saved model settings.
- Legacy direct-write operations, including demo reset and snapshot restore, return HTTP 403 by default. Enable `ENABLE_LEGACY_DEMO_WRITES=true` only for a disposable local demo, then restart the backend. Use **Import Plan → Review Queue** for the regular build workflow.
- Review Queue demonstrates review decisions and graph application; it is not an authorization boundary.

</details>

## Try the reference workflow

1. **Build from your data.** Open **Data Pipeline → Import data**, describe your goal, and upload source files or load sample files. Review the assistant’s mappings, resolve pending decisions, and preview the changes before submitting for review. **Manual configuration** retains the six-stage import workflow.
2. **Review a change.** In **Review Queue**, inspect a candidate's properties and audit trail, then approve and apply it. Approval and application are separate actions.
3. **Trace a reference answer.** Open **Evaluation & feedback → Reference tests · 22**, then run **Q03: What is PF001's first ingredient?** Inspect the `CONTAINS` path and cited records. Select **Explore in graph** to check the runtime relationship.
4. **Query with ontology tools.** Ask the **Analyst Agent**, “Which products contain chicken?” Inspect the answer, recorded tool calls, and returned relationship paths. Continue the conversation or leave feedback. Proposed updates go through Review Queue.
5. **Evaluate answers.** In **Evaluation & feedback**, run the supplied Agent cases with the deterministic baseline or a configured model. Compare recorded runs, review answers that need judgment, and turn query feedback into an editable case.

To explore a new schema, use **Data Pipeline → Design schema draft**. Confirm proposed definitions and source bindings, then save or export the draft. These drafts do not activate a new runtime schema.

The reference also includes object and graph exploration, four-state rule evaluation, agent traces, and graph snapshots, diffs, and rollback. Use **Demo Center → Start Golden Demo** for the guided tour.

<details>
<summary>View the workflow screenshots</summary>

### Runtime overview

![Dashboard with the seeded Pet Food runtime](media/dashboard.png)

### Assisted build

![Describe the build goal and upload three source files](media/build-sources.png)

### Source mapping

![Source column types, missing values, and sample records](media/data-profile.png)

![Source field mappings and review controls](media/data-pipeline.png)

Confirm mappings before preparing candidates. A confirmed mapping records a decision; it does not prove that data is queryable in Neo4j.

### Change review

![Review Queue with a candidate product and its properties](media/review-queue.png)

Inspect a candidate before approval. The recording adds PF101, two ingredients, and two `CONTAINS` relationships to an already seeded graph. All five changes are reviewed and applied; this is not a full rebuild from an empty graph.

![PetFoodProduct definition and schema draft controls](media/ontology-manager.png)

Ontology Manager exposes definitions and local edit drafts without changing the active YAML.

### Graph exploration

![Graph Explorer with typed objects and relationship filters](media/graph.png)

Search for an object, inspect its neighborhood, or expand the overview's relationship display.

### Answer evidence

![Q03 answer with a relationship path and cited CSV source records](media/verified-questions.png)

The fixed Q03 answer reads checked-in sample files. Graph Explorer separately checks whether the corresponding relationship exists in the runtime graph.

![PF101 neighborhood with a matching runtime relationship from the Agent query](media/graph-evidence.png)

### Analyst Agent

![Live DeepSeek answer for the ingredients in newly imported PF101](media/analyst-agent.png)

The recording uses DeepSeek for the build proposal and for query planning and answer summarization. It shows recorded tool calls and checks the returned relationship in the runtime graph.

</details>

The video and screenshots capture the v0.6.0 light workspace. The video follows assisted import, human review, runtime verification, and a live model query about the imported product. See [Assisted build](docs/assisted-build.md), [Query Workbench](docs/query-workbench.md), and [Evaluation & feedback](docs/question-set-evaluation.md) for current flows.

[Product workflow](docs/product-workflow.md) · [Recording notes and additional captures](media/README.md)

## Scope and evaluation

This repository is a learning reference. Production readiness, enterprise identity and access management, and applicability across multiple business domains have not been established.

- **Reference answers and Agent queries use different evidence.** Reference tests read checked-in CSV/YAML files; graph highlighting checks for matching runtime relationships. Agent queries use runtime tools. Their returned evidence strings are not original file-row or document citations.
- **Evaluation scores cover configured checks.** Agent evaluation records actual answers, tools, and traces. Scores reflect the configured checks, with separate manual review where needed. They do not establish general Agent accuracy. The video uses a configured DeepSeek model; the key is not included in the recording or repository.
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
| [Assisted build and schema design](docs/assisted-build.md) | Multi-source assistance, mapping review, and schema drafts |
| [Data pipeline](docs/data-pipeline.md) | Manual source profiling, mapping, and import plans |
| [Review Queue](docs/review-queue-runtime.md) | Review decisions and graph application |
| [Ontology kernel](docs/ontology-kernel.md) | Schema definitions and validation |
| [Query Workbench](docs/query-workbench.md) | Conversations, runtime tools, relationship paths, and feedback |
| [Evaluation & feedback](docs/question-set-evaluation.md) | Model setup, editable cases, run comparison, and manual review |
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

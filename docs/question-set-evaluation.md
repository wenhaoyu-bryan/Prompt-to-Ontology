# Question-set evaluation and feedback

The **Evaluation & feedback** workspace runs questions against the same read-only Agent as the query page. The layout provides a question list, result details, answer/evidence inspection, history comparison, and a feedback queue.

## Model setup

DeepSeek uses the OpenAI-compatible Chat Completions protocol. The documented model ID `deepseek-flash` currently serves DeepSeek 4.1 Flash; see the [official API guide](https://api-docs.deepseek.com/quick_start/agent_integrations/).

For Docker, copy `.env.example` to the repository's `.env`, then set:

```dotenv
LLM_BACKEND=deepseek
DEEPSEEK_API_KEY=your-deepseek-key
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

Start or rebuild with `docker compose up --build -d`. Native backend development can use the same values in `backend/.env`. Environment files are ignored by Git and excluded from the root Docker build context. The **Model configuration** sidebar page saves reusable OpenAI-compatible Chat Completions or Anthropic Messages connections. Assign build and query models independently: schema design uses the build binding and evaluations use the query binding. **Deployment default** uses the legacy in-memory override, if present, then environment variables. Without a model the deterministic baseline remains available.

Saved connections and bindings persist in `backend/.runtime/llm-connections.json`, atomically written with mode `0600`. This server-only file contains plaintext keys: protect the runtime volume and its backups. APIs return masked keys. Docker's `backend_runtime` volume survives container recreation; deleting the volume deletes the settings. Native development can override `LLM_CONNECTIONS_PATH`. The file store supports one backend process, not concurrent multi-worker writes.

For Anthropic defaults set `LLM_BACKEND=anthropic`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, and `ANTHROPIC_BASE_URL=https://api.anthropic.com`. A pasted trailing `/v1` is normalized. For custom OpenAI-compatible services use `LLM_BACKEND=openai_compatible` with `OPENAI_*` variables. Include the provider-required version prefix in the OpenAI base URL; `/chat/completions` is appended. Enter the exact model ID supplied by your provider.

**Test connection** sends a short text request; it does not certify tool-workflow quality. A blank key on edit retains the saved key only when protocol and endpoint are unchanged. Re-enter the key when changing either. No secrets are stored in browser local/session storage.

For shared deployments set a strong `MODEL_CONFIG_TOKEN` and enter it in Model configuration. The browser retains it only in the current tab's memory. Configure exact frontend origins in `MODEL_CONFIG_ALLOWED_ORIGINS` (comma-separated); local loopback origins work by default. The origin guard mitigates cross-origin browser requests; it is not authentication. Protect the whole application with an authenticated reverse proxy before exposing it publicly. Settings are deployment-wide, not per-user accounts.

Each query captures its model configuration. Evaluation batches retain that configuration in memory for their callbacks, so changing settings during a batch does not mix providers or models. Credentials are not saved in question or run records.

## Defining checks

Four initial Agent cases are defined in `sample-data/pet-food/agent-evaluation-cases.v1.json`. Add or edit cases through the workspace. Every case requires a question and a human-readable expected result. Optional automatic checks cover:

- Required returned object/rule IDs and an exact product ID set.
- Required relationship endpoints and types, or the absence of paths.
- Literal phrases that the answer must contain or exclude.
- Literal references required in returned tool evidence.
- Missing-data tool responses for unanswerable questions.

Scores are the percentage of configured automatic checks that passed. They are not a semantic-accuracy score. The evaluator does not use the model to generate its own gold answer. Runtime evidence strings are distinct from original document or file-row citations, which these Agent tools do not supply.

Unanswerable generated answers require a separate review of the actual answer: an empty tool result cannot establish that the model avoided unsupported claims. Cases without automatic criteria also require review and have no automatic score. **Accept after review** records a decision, note and timestamp without changing automatic checks or their numeric score. Failed automatic checks remain visible. This follows the project's single-user demo scope, without adding reviewer identity or enterprise authorization.

## Runs, revisions and comparison

Select current-model execution or a deterministic baseline, then run one question or the filtered question set. Batches run sequentially in the backend and persist progress after each question. Model fallback cannot pass a model evaluation. Restarted unfinished batches are marked interrupted and can be rerun.

Each run retains question/criteria snapshots, actual answers and tool results, model metadata, run and trace IDs, duration, schema hash and execution-code hash. Editing a case does not rewrite its historical answers. Latest results are shown only when the current question and criteria match the stored snapshot. Historical questions remain available in the run selector.

Comparison shows prior/current scores, answers, and additions/removals in returned objects, evidence and paths. A changed question or expectation is marked as a different comparison basis. Source-data freshness and general semantic correctness still require suitable source evidence and review.

Use **Reproduce in query** to open the recorded question. The question, batch and return location are retained through submission and graph navigation. Ontology definition drawers link to related questions; evaluation reads the active runtime definitions and graph. Local definition drafts do not change the runtime being evaluated.

## Feedback loop

Query feedback links to its actual trace and run. Maintainers can inspect feedback, mark it processed, or turn it into an editable case. Converting the same feedback again returns the existing linked case. Identical feedback retries preserve review metadata; changed feedback reopens review while retaining its case link and prior review history.

The existing 22-question file-based reference suite remains available under **Reference tests**. It checks the bounded reference contracts separately from live Agent/model execution.

## Storage and verification

Cases and batches use atomic JSON writes under `backend/.runtime`. This is a single-process local runner, not a distributed job queue. Evaluation creates run records and may retain proposed changes, but does not apply them to the graph or execute external business actions.

```sh
cd backend
python -m unittest discover -s tests
```

Against a running, disposable application without a paid model configured:

```sh
cd frontend
npx playwright test tests/smoke/evaluation-workbench.spec.js --workers=1
```

Browser regression tests use deterministic execution. Live-provider checks are separate, explicit model calls; CI does not require a private API key.

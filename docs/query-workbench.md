# Query Workbench

The Analyst Agent is a conversation workspace for the existing Pet Food query tools. It retains the application's Ant Design theme and connects query results to Graph Explorer.

## Workflow

1. Start a conversation with a question or a suggested example.
2. Read the conclusion, then expand the full explanation or recorded tool calls.
3. Inspect **Results**, **Relationships**, **Sources**, and, when supplied, **Limitations**.
4. Open a returned relationship in Graph Explorer. The graph checks its endpoints and relation type against current runtime data and highlights matching edges. **Back to answer** returns to the original conversation and turn.
5. Continue with a follow-up, revisit an earlier answer, or record positive/negative feedback for that run.

The header and composer remain visible while the conversation body scrolls. Conversations can be searched, renamed, pinned, archived, restored, and deleted.

## Data and execution boundaries

- Conversations and selected answers are saved in this browser's local storage. They are not synchronized across devices or shared as authorized server sessions. Deleting a conversation removes browser history; it does not delete server traces or feedback.
- The existing `/api/pet-food/agent/chat` endpoint returns actual structured tool results, arguments, status, timestamps, and elapsed time. Configured models receive a bounded history of up to four previous question/answer pairs. Client history is context, not source evidence.
- Without a configured model, the workspace uses deterministic demo routing and template answers. A follow-up can use one explicitly named product; comparisons do not silently choose one of multiple products. Unrecognized questions ask for clarification instead of running an unrelated query.
- Ingredient relationship paths are populated only from records returned by the query. They describe endpoints and relationship types, not a unique identity for parallel edges. Graph Explorer highlights only matching current edges; a changed or missing relationship is reported as absent.
- **Sources** exposes runtime tool data and returned evidence strings. Original file-row and document-fragment citations are not supplied by these tools. This workspace does not present them as verified source citations.
- Query process displays observable tool execution, not model internal reasoning.
- Queries are read-only. Existing proposed ontology changes still go through Review Queue. This feature does not implement external business actions.

## Feedback API

`POST /api/agent/feedback` accepts `trace_id`, `agent_run_id`, `conversation_id`, `turn_id`, `rating` (`positive` or `negative`), optional `category`, and optional `comment`. Negative feedback requires a category. The trace must exist and belong to the supplied run. A second submission for the same trace updates its feedback record.

`GET /api/agent/feedback/{trace_id}` returns the stored feedback or `null`. Records are saved atomically in `backend/.runtime/query_feedback.json`, alongside the existing demo runtime state. These endpoints follow this project's single-user demo scope; they do not add multi-user identity or authorization.

## Verification

```sh
cd backend
python -m unittest discover -s tests -p test_query_workbench.py
```

Against a running application:

```sh
cd frontend
npx playwright test tests/smoke/query-workbench.spec.js --workers=1
```

The browser checks cover real graph queries, feedback readback, relationship navigation and return, follow-up context, retained turns, rename/archive/restore, retry after failure, fixed controls, and a mobile viewport. Backend tests check bounded model context, recorded failures, actual path endpoints, unsupported queries, and feedback validation/persistence. Model answer quality with a live provider requires a configured model and separate evaluation.

# Review Queue Runtime

## Why Review Exists

The ontology graph must not be mutated directly by import scripts, AI, or pipeline logic. All candidate objects, candidate links, validation warnings, and suggested updates must become reviewable items first. This is what makes the ontology trustworthy.

The correct workflow is:

```
Candidate → Review Item → Human Approval → Apply to Graph → Applied Status
```

## Why Pipeline Does Not Directly Write to Graph

The Data Pipeline (Phase 28) profiles data, suggests mappings, generates candidate objects/links, validates candidates, and produces an Import Plan. It deliberately does NOT write to Neo4j. This separation ensures:

- No unvalidated data enters the graph
- Every mutation has a human approval trail
- Audit history is preserved
- Rollback is possible (reject instead of approve)

## Architecture

```
backend/review_queue/
  __init__.py          — Package exports
  models.py            — Pydantic models (ReviewItem, ReviewBatch, etc.)
  storage.py           — JSON file persistence (.runtime/)
  import_plan_adapter.py — ImportPlan → ReviewBatch + ReviewItems
  graph_writer.py      — Write approved items to Neo4j (MERGE/upsert)
  service.py           — Business logic (approve/reject/apply)
```

## Models

### ReviewItem

Core review unit. One candidate object, link, or warning becomes one ReviewItem.

| Field | Description |
|---|---|
| `id` | Unique identifier (e.g., `ri-abc123def456`) |
| `batch_id` | Parent batch reference |
| `type` | IMPORT_OBJECT_CANDIDATE, IMPORT_LINK_CANDIDATE, VALIDATION_WARNING, etc. |
| `status` | pending → approved/rejected → applied/failed |
| `severity` | low, medium, high, critical, info |
| `source` | import_plan, agent, rule_engine, manual, demo |
| `candidate_object` | Object data (id, type, properties, confidence) |
| `candidate_link` | Link data (source_id, target_id, type) |
| `reviewed_by` | Who approved/rejected |
| `decision_reason` | Why |
| `apply_error` | Error message if graph write failed |

### ReviewBatch

Groups ReviewItems from a single ImportPlan submission.

| Field | Description |
|---|---|
| `id` | Unique identifier (e.g., `batch-abc123def456`) |
| `source_plan_id` | The ImportPlan ID |
| `status` | Derived from item statuses |
| `item_count` | Total items |
| `pending_count` / `approved_count` / `rejected_count` / `applied_count` / `failed_count` | Status breakdown |

### Status Flow

```
ReviewItem:  pending → approved → applied
                         ↘ failed (retry allowed)
             pending → rejected (terminal)

ReviewBatch: pending → partially_reviewed → approved → applied
                                              ↘ partially_applied
```

## Import Plan → Review Items

`create_review_batch_from_import_plan(import_plan)` converts:

- Each `candidate_object` → IMPORT_OBJECT_CANDIDATE item
- Each `candidate_link` → IMPORT_LINK_CANDIDATE item
- Each warning/info validation issue → VALIDATION_WARNING item

Guards:
- Plans with critical/error validation issues cannot be submitted
- Empty plans (no candidates) cannot be submitted

## Approve / Reject / Apply

| Action | Allowed When | Effect |
|---|---|---|
| Approve | status = pending | status → approved |
| Reject | status = pending | status → rejected (terminal) |
| Apply | status = approved | Writes to Neo4j, status → applied (or failed) |

## JSON Persistence

Runtime state is stored under `backend/.runtime/`:

```
backend/.runtime/
  review_items.json
  review_batches.json
```

- Created automatically if missing
- Loaded on backend startup
- Persisted after every create/update/apply operation
- Page refresh does not lose review state
- Never committed to Git (in .gitignore)

## Graph Write Behavior

### Candidate Objects

Uses `MERGE (n:\`{type}\` {id: $node_id})` — upsert semantics. If the node already exists, properties are updated. Metadata is attached:

```
_review_item_id, _review_status, _applied_at, _confidence
```

### Candidate Links

Verifies source and target nodes exist first. Uses `MERGE (a)-[r:\`{type}\`]->(b)`. Same metadata attachment.

### Unsupported Types

Validation warnings, agent suggestions, etc. return: "This review item type is not graph-applicable yet." They are NOT silently marked as applied.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/review/from-import-plan/{plan_id}` | Submit plan to review |
| GET | `/api/review/items` | List items (filter: status, source, batch_id, type) |
| GET | `/api/review/items/{item_id}` | Get one item |
| POST | `/api/review/items/{item_id}/approve` | Approve item |
| POST | `/api/review/items/{item_id}/reject` | Reject item |
| POST | `/api/review/items/{item_id}/apply` | Apply to graph |
| GET | `/api/review/batches` | List batches |
| GET | `/api/review/batches/{batch_id}` | Get batch |
| POST | `/api/review/batches/{batch_id}/apply-approved` | Apply all approved in batch |
| GET | `/api/review/summary` | Queue statistics |

## Current Limitations

- Single-user (no multi-user auth)
- No background jobs (apply is synchronous)
- No rollback for applied items (would need Neo4j transaction log)
- Agent-generated review items not yet implemented
- No bulk approve/reject

## Future: Agent Integration

Agent runs will be able to submit suggested changes as review items (type: AGENT_SUGGESTION). This follows the same HITL pattern: agent suggests → human reviews → approved changes enter the graph.

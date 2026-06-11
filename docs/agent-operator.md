# Agent Operator

## Why Agent Cannot Directly Mutate the Graph

The ontology graph must remain trustworthy. If the Agent could write directly to Neo4j, there would be no audit trail, no human approval, and no way to catch mistakes. The correct workflow is:

```
Agent suggestion → Review Item → Human Approval → Apply to Graph
```

## Architecture

```
backend/agent_operator/
  __init__.py            — Package exports
  models.py              — AgentSuggestedAction, AgentSuggestionBatch, AgentOperatorResult
  suggestion_builder.py  — Deterministic builders for 5 suggestion types
  review_adapter.py      — Convert suggestions to Review Queue items
  service.py             — Analyze agent answers, submit to review
```

## Supported Suggestion Types

| Type | Description | Review Item Type |
|---|---|---|
| `SUGGEST_PROPERTY_UPDATE` | Update a property on an existing object | AGENT_SUGGESTION |
| `SUGGEST_LINK_CREATION` | Create a new relationship | IMPORT_LINK_CANDIDATE |
| `SUGGEST_OBJECT_CREATION` | Create a new ontology object | IMPORT_OBJECT_CANDIDATE |
| `SUGGEST_RULE_ACTION` | Review action triggered by a rule | RULE_TRIGGERED_ACTION |
| `FLAG_DATA_QUALITY_ISSUE` | Missing or insufficient data | VALIDATION_WARNING |

## How Suggestions Are Generated

The Agent Operator uses **deterministic rules** (not LLM) to analyze agent answers:

1. **Missing data**: If the answer mentions "not_evaluable", "missing", or "insufficient", data quality issues are flagged for affected products.
2. **Risk triggered**: If the answer mentions triggered risk rules, rule action suggestions are created.
3. **Property update intent**: If the user message matches patterns like `Set PF001 fat_100g to 18.5`, a property update suggestion is created.
4. **Link creation intent**: If the user message matches patterns like `Add chicken as an ingredient for PF001`, a link creation suggestion is created.
5. **Object creation intent**: If the user message matches patterns like `Create a new Ingredient object`, an object creation suggestion is created.

## How Suggestions Become Review Items

`review_adapter.py` converts `AgentSuggestedAction` → `ReviewItem`:

- source = `agent`
- type mapped from action type (see table above)
- status = `pending`
- metadata includes agent_run_id, user_message, reason, property_update details
- persisted through existing Review Queue storage

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/pet-food/agent/chat` | Agent chat (now includes suggestions) |
| POST | `/api/agent/suggestions/submit-review` | Submit suggestions to review queue |

### Agent Chat Response (extended)

```json
{
  "answer": "...",
  "tools_used": [...],
  "llm_used": true,
  "agent_run_id": "run-abc123",
  "suggestions": [...],
  "requires_review": true,
  "can_submit_to_review": true,
  "review_batch_id": null,
  "review_item_ids": []
}
```

### Submit Suggestions Request

```json
{
  "agent_run_id": "run-abc123",
  "user_message": "Set PF001 fat_100g to 18.5",
  "suggestions": [...]
}
```

## Apply Semantics

Agent suggestions have different apply behaviors:

| Suggestion Type | Apply Behavior |
|---|---|
| `SUGGEST_PROPERTY_UPDATE` | Updates property on target node in Neo4j |
| `SUGGEST_LINK_CREATION` | Creates relationship (same as import link candidate) |
| `SUGGEST_OBJECT_CREATION` | Creates node (same as import object candidate) |
| `SUGGEST_RULE_ACTION` | Advisory only — returns "not graph-applicable" |
| `FLAG_DATA_QUALITY_ISSUE` | Advisory only — returns "not graph-applicable" |

Advisory suggestions return `status="failed"` with a clear error message. They are never silently marked as applied.

## Property Update Apply

When an approved `SUGGEST_PROPERTY_UPDATE` item is applied:
- Target object is found by `object_id`
- Specified property is updated to `new_value`
- Metadata attached: `_last_review_item_id`, `_last_agent_run_id`, `_last_updated_by`, `_last_updated_at`, `_last_update_reason`

## Current Limitations

- Deterministic pattern matching only (no LLM-based suggestion generation)
- Property update patterns support English and basic Chinese
- Link creation defaults to CONTAINS type
- No rollback for applied agent suggestions
- Single-user mode

## Future

- LLM-based suggestion extraction from agent answers
- Multi-step suggestion workflows (propose → refine → submit)
- Agent suggestion confidence scoring based on evidence strength

# Agent Trace & Evaluation

## Why This Exists
Agent Operator answers need to be traceable and evaluable. This module stores structured summaries of agent reasoning.

## What Is Captured
- Question asked
- Answer generated
- Tool calls made (name, input/output summaries)
- Objects referenced (product IDs, types)
- Rules referenced
- Evidence edges referenced
- Suggestions generated
- Review Queue linkage

## What Is Not Captured
- Hidden chain-of-thought
- Raw LLM prompts with secrets
- Full tool output dumps (summarized/truncated)

## No Chain-of-Thought Policy
This system stores structured trace summaries only. Internal reasoning is not persisted.

## Evaluation Scoring
5 deterministic scores (0-1.0):
- Groundedness: answer length and specificity
- Tool Usage: whether tools were called
- Evidence Coverage: evidence edges and rules referenced
- Review Safety: no direct graph mutation bypass
- Answer Completeness: answer detail level

## Suggestion Lifecycle
generated → submitted_to_review → approved/applied/rejected

## Known Limitations
- Evaluation is rule-based, not LLM-based
- Tool output is summarized, not full
- Traces are JSON-persisted, not database-backed

## Agent Suggestion Quality Rules (Phase 40)

### Rule 1: No UNKNOWN_RULE
Every rule-based suggestion must have a resolved `rule_id` and `rule_name`. If the rule ID cannot be resolved, the suggestion is suppressed.

### Rule 2: Field-Specific Data Quality
Data quality suggestions must name a concrete field (e.g., `taurine_mg_kg`, `phosphorus_100g`). Generic "data_quality" suggestions are not allowed.

### Rule 3: Intent-Gated Suggestions
Suggestions are only generated when relevant to the detected user intent:
- Informational questions: no suggestions unless severe data issue
- Recommendation questions: only if data gaps block recommendation
- Risk analysis: rule suggestions OK
- Data quality questions: field-specific suggestions OK
- Update requests: property/link suggestions OK

### Rule 4: Evaluation Flags
Agent Trace evaluation flags:
- `UNKNOWN_RULE_SUGGESTION` — if a suggestion contains UNKNOWN_RULE
- `GENERIC_DATA_QUALITY_SUGGESTION` — if a data quality suggestion lacks a specific field
- `LOW_RELEVANCE_SUGGESTION` — if suggestions are generated for informational questions

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

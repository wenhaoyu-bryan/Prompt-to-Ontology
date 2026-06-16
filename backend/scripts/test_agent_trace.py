"""Tests for Agent Trace & Evaluation — Phase 39."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent_trace import create_trace, list_traces, get_trace, evaluate_trace, get_evaluation, list_evaluations


# ---------------------------------------------------------------------------
# Shared mock data
# ---------------------------------------------------------------------------

MOCK_RESULT = {
    "answer": (
        "Based on the ontology graph, the following cat foods are missing taurine: "
        "PF003. This is a critical nutritional deficiency."
    ),
    "tools_used": ["get_product_rule_evaluations", "find_products_without_ingredient"],
    "llm_used": True,
    "products": [{"id": "PF003", "name": "Test Product", "type": "PetFoodProduct"}],
    "evidence": [{"source": "PF003", "target": "RR002", "type": "TRIGGERS_RISK"}],
    "suggestions": [],
}

passed = 0
failed = 0

def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name} {detail}")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

print("=" * 60)
print("Agent Trace — Smoke Test")
print("=" * 60)

# 1. Create trace from mock result
print("\n[1] Create Trace")
trace = create_trace(
    question="Which cat foods are missing taurine?",
    answer=MOCK_RESULT["answer"],
    agent_run_id="run-test-001",
    result=MOCK_RESULT,
)
check("trace is not None", trace is not None)
check("trace_id starts with trace-", trace.trace_id.startswith("trace-"), f"got {trace.trace_id}")
check("question stored", trace.question == "Which cat foods are missing taurine?")
check("answer stored", "PF003" in trace.answer)
check("agent_run_id stored", trace.agent_run_id == "run-test-001")
check("status is completed", trace.status == "completed")

# 2. List traces
print("\n[2] List Traces")
traces = list_traces()
check("list_traces returns non-empty", len(traces) >= 1)
check("created trace in list", any(t.trace_id == trace.trace_id for t in traces))

# 3. Get trace by ID
print("\n[3] Get Trace by ID")
retrieved = get_trace(trace.trace_id)
check("get_trace returns trace", retrieved is not None)
check("trace_id matches", retrieved.trace_id == trace.trace_id)
check("question matches", retrieved.question == trace.question)

# 4. Trace stores tool calls
print("\n[4] Tool Calls")
check("trace has tool_calls", len(trace.tool_calls) == 2, f"got {len(trace.tool_calls)}")
tool_names = [tc.tool_name for tc in trace.tool_calls]
check("has get_product_rule_evaluations", "get_product_rule_evaluations" in tool_names)
check("has find_products_without_ingredient", "find_products_without_ingredient" in tool_names)

# 5. Trace stores object references
print("\n[5] Object References")
check("trace has objects_referenced", len(trace.objects_referenced) >= 1, f"got {len(trace.objects_referenced)}")
if trace.objects_referenced:
    check("first object is PF003", trace.objects_referenced[0].id == "PF003")

# 6. Evaluate trace
print("\n[6] Evaluation")
ev = evaluate_trace(trace.trace_id)
check("evaluation is not None", ev is not None)
check("evaluation_id starts with eval-", ev.evaluation_id.startswith("eval-"), f"got {ev.evaluation_id}")
check("trace_id matches", ev.trace_id == trace.trace_id)
check("groundedness in range", 0.0 <= ev.scores.groundedness <= 1.0)
check("tool_usage in range", 0.0 <= ev.scores.tool_usage <= 1.0)
check("evidence_coverage in range", 0.0 <= ev.scores.evidence_coverage <= 1.0)
check("review_safety in range", 0.0 <= ev.scores.review_safety <= 1.0)
check("answer_completeness in range", 0.0 <= ev.scores.answer_completeness <= 1.0)
check("overall_status is good/warning/failed", ev.overall_status in ("good", "warning", "failed"))

# 7. Good trace gets good evaluation
print("\n[7] Good Trace Evaluation")
check("tool_usage is 1.0", ev.scores.tool_usage == 1.0, f"got {ev.scores.tool_usage}")
check("overall_status is good", ev.overall_status == "good", f"got {ev.overall_status}")

# 8. No-tool-call trace gets low tool_usage
print("\n[8] No Tool Calls Evaluation")
result_no_tools = dict(MOCK_RESULT, tools_used=[])
trace_no_tools = create_trace(
    question="Q no tools",
    answer="Short answer.",
    agent_run_id="run-notool",
    result=result_no_tools,
)
ev_no_tools = evaluate_trace(trace_no_tools.trace_id)
check("tool_usage is 0.0", ev_no_tools.scores.tool_usage == 0.0, f"got {ev_no_tools.scores.tool_usage}")

# 9. No-evidence trace gets low evidence_coverage
print("\n[9] No Evidence Evaluation")
result_no_ev = dict(MOCK_RESULT, evidence=[], products=[])
trace_no_ev = create_trace(
    question="Q no evidence",
    answer="No evidence answer.",
    agent_run_id="run-noev",
    result=result_no_ev,
)
ev_no_ev = evaluate_trace(trace_no_ev.trace_id)
check("evidence_coverage is 0.0", ev_no_ev.scores.evidence_coverage == 0.0, f"got {ev_no_ev.scores.evidence_coverage}")

# 10. No chain_of_thought field
print("\n[10] No Chain-of-Thought")
d = trace.model_dump()
check("no chain_of_thought in model", "chain_of_thought" not in d)
check("no chainOfThought in model", "chainOfThought" not in d)

# 11. Evaluation can be rerun
print("\n[11] Rerun Evaluation")
ev2 = evaluate_trace(trace.trace_id)
check("rerun returns same trace_id", ev2.trace_id == trace.trace_id)
check("rerun returns same status", ev2.overall_status == ev.overall_status)

# 12. Get evaluation by ID
print("\n[12] Get Evaluation by ID")
ev_by_id = get_evaluation(ev.evaluation_id)
check("get_evaluation returns evaluation", ev_by_id is not None)
check("evaluation_id matches", ev_by_id.evaluation_id == ev.evaluation_id)

# 13. List evaluations
print("\n[13] List Evaluations")
evals = list_evaluations()
check("list_evaluations returns non-empty", len(evals) >= 1)

# 14. Weak answer gets low scores
print("\n[14] Weak Answer Evaluation")
result_weak = dict(MOCK_RESULT, answer=".", tools_used=[], evidence=[], products=[])
trace_weak = create_trace(
    question="Q weak",
    answer=".",
    agent_run_id="run-weak",
    result=result_weak,
)
ev_weak = evaluate_trace(trace_weak.trace_id)
check("weak answer groundedness <= 0.5", ev_weak.scores.groundedness <= 0.5, f"got {ev_weak.scores.groundedness}")
check("weak answer completeness < 0.5", ev_weak.scores.answer_completeness < 0.5, f"got {ev_weak.scores.answer_completeness}")
check("weak answer status is warning/failed", ev_weak.overall_status in ("warning", "failed"), f"got {ev_weak.overall_status}")

# 15. Metadata sanitization
print("\n[15] Metadata Sanitization")
result_with_secrets = dict(MOCK_RESULT, chain_of_thought="secret reasoning", raw_prompt="secret prompt")
trace_meta = create_trace(
    question="Q meta",
    answer="Answer with metadata.",
    agent_run_id="run-meta",
    result=result_with_secrets,
    metadata={"mode": "test"},
)
check("metadata has mode", trace_meta.metadata.get("mode") == "test")
check("no chain_of_thought in metadata", "chain_of_thought" not in trace_meta.metadata)
check("no raw_prompt in metadata", "raw_prompt" not in trace_meta.metadata)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
total = passed + failed
print(f"Results: {passed}/{total} passed")
if failed > 0:
    print(f"  {failed} FAILED")
    sys.exit(1)
else:
    print("All tests passed!")
    sys.exit(0)

# Rule Studio & Simulation

## Why This Exists
Rules are the core of ontology-driven reasoning. Rule Studio makes them visible, explainable, and testable.

## Four-State Rule Evaluation
Each rule evaluates to one of four states:
- **Triggered** — sufficient evidence shows the rule condition was met.
- **Passed** — sufficient evidence shows the rule condition was not met.
- **Not Evaluable** — a required field or relationship is missing, invalid, or incomplete.
- **Not Applicable** — a known value places the product outside the rule's scope, such as a different target species.

The rule engine rejects unsupported condition types and operators when it loads the rules. An observed ingredient is evidence of its presence. A conclusion based on absence requires a confirmed complete list.

## Rule Coverage
Shows how many products triggered/passed/were-not-evaluable for each rule.

## Rule Detail
Plain-language explanation of rule logic, required fields, and deterministic examples.

## Simulation
Test a rule against custom input values without modifying the graph. Useful for "what-if" analysis.

The simulation API accepts `ingredient_names` and an optional boolean `ingredients_complete` (default `false`). Set it to `true` when the input represents the complete list. A runtime list read from the graph currently carries no completeness assertion.

## Evidence Edges
Triggered rules generate TRIGGERS_RISK edges in the graph. These are the output of automated reasoning.

## What This Phase Does Not Support
- Rule authoring (creating new rules)
- Rule editing (modifying existing rules)
- LLM-generated explanations
- Writing simulation results to graph

## Manual QA Flow
1. Reset to Seeded Demo Mode
2. Open Rule Studio
3. Confirm all 5 rules appear
4. Open rule detail for RR001
5. Run simulation with fat_100g=22 -> should trigger
6. Run simulation with fat_100g=10 -> should pass
7. Run simulation with missing fat_100g -> should be not_evaluable
8. Check Rule Coverage shows correct counts
9. Open Object Explorer for PF001 -> should show rule results

## Integration with Agent Suggestions (Phase 40)

When the Agent generates data quality suggestions, they reference specific rules and fields from the Rule Studio:

- `related_rule_id` — links to a rule in Rule Studio
- `missing_field` — the specific product field that is missing
- `why_it_matters` — explains which rule evaluation is blocked

This ensures traceability from Agent suggestions back to rule definitions.

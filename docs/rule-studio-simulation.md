# Rule Studio & Simulation

## Why This Exists
Rules are the core of ontology-driven reasoning. Rule Studio makes them visible, explainable, and testable.

## Four-State Rule Evaluation
Each rule evaluates to one of four states:
- **Triggered**: condition met, TRIGGERS_RISK edge generated
- **Passed**: condition not met, product is safe for this rule
- **Not Evaluable**: required data fields are missing
- **Not Applicable**: rule doesn't apply to this product (e.g., wrong species)

## Rule Coverage
Shows how many products triggered/passed/were-not-evaluable for each rule.

## Rule Detail
Plain-language explanation of rule logic, required fields, and deterministic examples.

## Simulation
Test a rule against custom input values without modifying the graph. Useful for "what-if" analysis.

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

# Demo Script

60-second walkthrough of Ontology OS using the Pet Food validation domain.

---

## 0–10s: Product Framing

"This is Ontology OS, a ready-data operational ontology runtime."

"It is not a pet food app. Pet Food is just the validation domain."

---

## 10–20s: Objects Workspace

Show the Objects tab with PetFoodProduct cards.

Explain that each product is an ontology object with typed properties, relationships, and rule evaluations.

Point out the risk badges on products that triggered rules.

---

## 20–30s: Object View

Click one product (e.g. PF001).

Show the structured 5-section view:
- **Nutrition** — 7 nutrient bars with risk-highlighted fields
- **Ingredients** — ordered list with allergen flags
- **Risk Explanation** — severity, evidence, reason per triggered rule
- **Rule Evaluation** — 4-state summary (triggered / passed / not_evaluable / not_applicable)
- **Actions** — explain risk, recommend alternative, watchlist, report

---

## 30–40s: Graph Workspace

Switch to Graph tab.

Show the local graph around the selected product:
- Product → Brand
- Product → Ingredients
- Product → Species
- Product → LifeStage
- Product → RiskRule

Demonstrate depth control (1-hop / 2-hop) and link type toggles.

---

## 40–50s: Schema Workspace

Switch to Schema tab.

Show:
- Object types (6 types with instance counts)
- Link types (6 relationship types)
- Rules (5 rules with severity badges)
- Actions (4 action definitions)
- Health summary cards

---

## 50–60s: Agent Workspace

Switch to Agent tab.

Ask: "Why is this product risky?"

Show that the agent answers using:
- Graph evidence
- Rule evaluations
- Tools used
- Data limitations
- Disclaimer

---

## Closing Line

"This is a mini operational ontology runtime: objects, links, rules, constraints, evidence, and agent reasoning in one workflow."

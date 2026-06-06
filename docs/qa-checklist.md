# QA Checklist — Pet Food Demo

## Objects Tab

- [ ] Default view shows PetFoodProduct cards
- [ ] Product cards display name, brand, species, life stage, category
- [ ] Risk badge visible on products with triggered rules
- [ ] Click a card → right panel shows EntityInspector
- [ ] EntityInspector shows product details, ingredients, risk rules, rule evaluations
- [ ] Rule evaluation section shows 4-state counts (triggered/passed/not_evaluable/not_applicable)
- [ ] Not-evaluable rules display amber warning with missing fields

## Graph Tab

- [ ] Local mode: shows subgraph for selected product (1-hop)
- [ ] Depth toggle switches between 1-hop and 2-hop
- [ ] Global mode: shows full graph
- [ ] Node click selects node and shows detail panel
- [ ] Type toggles filter visible node/link types

## Schema Tab

- [ ] Object Types section shows all 6 types with instance counts
- [ ] Link Types section shows all 6 relationship types
- [ ] Rules section shows all 5 rules with severity badges
- [ ] Actions section shows all 4 actions
- [ ] Health summary cards show correct counts
- [ ] Data Source Status panel shows domain and data source info

## Agent Tab

- [ ] Chat interface loads with example questions
- [ ] Example questions are in English
- [ ] Click an example question → agent responds
- [ ] Agent response includes: Conclusion, Graph Evidence, Rule Evaluation, Tools Used, Note
- [ ] Tools used badges display correctly
- [ ] Reasoning trace expandable (when LLM used)
- [ ] Context bar shows "Current product:" when a product is selected
- [ ] Disclaimer appears in every response: "not veterinary diagnosis"

## Rule Evaluations

- [ ] Products with insufficient nutrition data → not_evaluable
- [ ] Products with wrong species target → not_applicable
- [ ] Products meeting all criteria → passed
- [ ] Products violating a rule → triggered
- [ ] PF001 (high fat cat food) → triggered for high fat rule
- [ ] PF011 (senior dog, high phosphorus) → not_applicable for cat rules

## Data Limitations

- [ ] Agent tool `find_products_with_not_evaluable_rules` returns correct products
- [ ] Not-evaluable results include ingredient data (not inflated by missing CONTAINS)
- [ ] Agent answer includes "Data Limitations" section when applicable

## Agent Fallback Mode

- [ ] When LLM is not configured, deterministic router is used
- [ ] Log message shows: "LLM planning unavailable, using deterministic router"
- [ ] Keyword routing correctly maps questions to tools
- [ ] Taurine questions use `find_cat_foods_missing_taurine` tool (RR002)
- [ ] No v1 petfood_agent imports in v2 module
- [ ] Template answer format matches: Conclusion / Graph Evidence / Rule Evaluation / Tools Used / Note

## Sample Import

- [ ] Sample CSV data loads on startup
- [ ] 12 products imported into Neo4j
- [ ] Ingredient relationships (CONTAINS) created
- [ ] Brand relationships (MADE_BY) created
- [ ] TRIGGERS_RISK edges created for matching rules

## Constraint Validation

- [ ] All English UI strings (no Chinese in agent output)
- [ ] All English tool descriptions
- [ ] No veterinary diagnosis claims in any response
- [ ] Smoke test passes all 7 endpoints

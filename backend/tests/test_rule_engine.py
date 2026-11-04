import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from ontology_registry import OntologyRegistry
from rule_engine import RuleEngine


class RuleEngineTests(unittest.TestCase):
    def setUp(self):
        self.engine = RuleEngine(OntologyRegistry("pet_food"))

    def evaluate(self, rule_id, product, ingredients=(), **kwargs):
        return next(
            result for result in self.engine.evaluate_product_full(product, list(ingredients), **kwargs)
            if result["rule_id"] == rule_id
        )

    def test_missing_scope_is_unknown_but_known_mismatch_is_not_applicable(self):
        for rule_id, product, field in [
            ("RR002", {}, "target_species"),
            ("RR004", {"target_species": "unknown", "life_stage": "senior"}, "target_species"),
            ("RR004", {"target_species": "cat", "life_stage": ""}, "life_stage"),
        ]:
            with self.subTest(rule=rule_id, field=field):
                result = self.evaluate(rule_id, product)
                self.assertEqual(result["status"], "not_evaluable")
                self.assertEqual(result["missing_fields"], [field])
        self.assertEqual(self.evaluate("RR004", {"target_species": "dog"})["status"], "not_applicable")

    def test_absence_requires_evidence_of_completeness(self):
        partial = self.evaluate("RR002", {"target_species": "cat"}, ["chicken"])
        self.assertEqual(partial["status"], "not_evaluable")
        self.assertEqual(partial["missing_relations"], ["CONTAINS"])
        complete = self.evaluate(
            "RR002", {"target_species": "cat"}, ["chicken"], ingredients_complete=True
        )
        self.assertEqual(complete["status"], "triggered")
        present = self.evaluate("RR002", {"target_species": "cat"}, ["taurine"])
        self.assertEqual(present["status"], "passed")

    def test_no_match_requires_complete_ingredients(self):
        for ingredients in ([], ["rice"]):
            with self.subTest(ingredients=ingredients):
                result = self.evaluate("RR003", {}, ingredients)
                self.assertEqual(result["status"], "not_evaluable")
                self.assertEqual(result["missing_relations"], ["CONTAINS"])
        self.assertEqual(self.evaluate("RR003", {}, ["chicken"])["status"], "triggered")
        self.assertEqual(
            self.evaluate("RR003", {}, ["rice"], ingredients_complete=True)["status"], "passed"
        )

    def test_invalid_nutrition_inputs_are_unknown(self):
        for value in ("21", True, float("nan"), float("inf")):
            with self.subTest(value=value):
                result = self.evaluate("RR001", {"fat_100g": value})
                self.assertEqual(result["status"], "not_evaluable")
        self.assertEqual(self.evaluate("RR001", {"fat_100g": 20})["status"], "passed")
        self.assertEqual(self.evaluate("RR001", {"fat_100g": 21})["status"], "triggered")

    def test_invalid_condition_is_rejected_before_evaluation(self):
        for condition, message in [
            ("{type: misspelled}", "unsupported condition type"),
            ('{type: nutrition_threshold, field: fat_100g, operator: ">>", value: 20}', "unsupported operator"),
            ('{type: compound, nutrition_threshold: {field: fat_100g, operator: ">", value: true}}', "finite number"),
        ]:
            with self.subTest(condition=condition), TemporaryDirectory() as directory:
                Path(directory, "rules.yaml").write_text(
                    f"rules:\n  bad_rule:\n    rule_id: BAD\n    condition: {condition}\n",
                    encoding="utf-8",
                )
                with self.assertRaisesRegex(ValueError, f"bad_rule.*{message}"):
                    RuleEngine(OntologyRegistry(base_dir=directory))

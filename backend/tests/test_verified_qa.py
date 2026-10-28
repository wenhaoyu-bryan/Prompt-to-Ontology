"""P4: bounded read-only answers must carry real source and path evidence."""

import hashlib
import shutil
import tempfile
import unittest
from pathlib import Path

from verified_qa.service import VerifiedQAService
from fastapi.testclient import TestClient
from main import app


ROOT = Path(__file__).resolve().parents[2]


class VerifiedQATests(unittest.TestCase):
    def setUp(self):
        self.service = VerifiedQAService(ROOT)

    def test_rule_answer_has_fact_rule_and_evaluation_path(self):
        answer = self.service.answer("Q01")
        self.assertEqual((answer.status, answer.value), ("answered", "triggered"))
        self.assertIn("phosphorus_100g", {e.field for e in answer.evidence})
        self.assertTrue(any(e.kind == "rule" and e.record_id == "RR004" for e in answer.evidence))
        self.assertTrue(any(p.kind == "rule_evaluation" and p.source_id == "PF003" and p.target_id == "RR004" for p in answer.path))
        self.assertTrue(all(e.source_sha256 for e in answer.evidence))

    def test_first_ingredient_uses_actual_instance_relation(self):
        answer = self.service.answer("Q03")
        self.assertEqual((answer.status, answer.value), ("answered", "chicken"))
        self.assertTrue(any(p.kind == "instance_relation" and p.relation == "CONTAINS" and p.source_id == "PF001" and p.target_id == "ING001" for p in answer.path))
        self.assertTrue(any(e.source_path.endswith("product_ingredients.csv") and e.record_id == "PF001:ING001" for e in answer.evidence))

    def test_missing_field_and_time_are_unknown(self):
        supplier = self.service.answer("Q06")
        recency = self.service.answer("Q07")
        self.assertEqual(supplier.status, "unknown")
        self.assertIn("source_field_missing", supplier.unknown_reasons)
        self.assertEqual(recency.status, "unknown")
        self.assertIn("trusted_time_missing", recency.unknown_reasons)
        self.assertIsNone(recency.value)

    def test_missing_source_or_relation_never_becomes_a_fact(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            shutil.copytree(ROOT / "sample-data/pet-food", target / "sample-data/pet-food")
            shutil.copytree(ROOT / "ontology/pet_food", target / "ontology/pet_food")
            (target / "sample-data/pet-food/pet_food_products.csv").unlink()
            unavailable = VerifiedQAService(target).answer("Q01")
            self.assertEqual(unavailable.status, "unknown")
            self.assertIn("source_unavailable", unavailable.unknown_reasons)

            shutil.copy2(ROOT / "sample-data/pet-food/pet_food_products.csv", target / "sample-data/pet-food/pet_food_products.csv")

            relation = target / "sample-data/pet-food/product_ingredients.csv"
            relation.write_text("product_id,ingredient_id,ingredient_order\n", encoding="utf-8")
            missing_path = VerifiedQAService(target).answer("Q03")
            self.assertEqual(missing_path.status, "unknown")
            self.assertIn("instance_relation_missing", missing_path.unknown_reasons)

    def test_answers_do_not_mutate_sources(self):
        paths = [ROOT / "sample-data/pet-food/pet_food_products.csv", ROOT / "sample-data/pet-food/product_ingredients.csv", ROOT / "ontology/pet_food/rules.yaml"]
        before = [hashlib.sha256(path.read_bytes()).hexdigest() for path in paths]
        for question_id in ("Q01", "Q03", "Q06", "Q08"):
            self.service.answer(question_id)
        after = [hashlib.sha256(path.read_bytes()).hexdigest() for path in paths]
        self.assertEqual(before, after)

    def test_question_catalog_has_no_reference_answers_and_rejects_unknown_id(self):
        source = (ROOT / "sample-data/pet-food/verified-questions.v2.json").read_text(encoding="utf-8")
        self.assertNotIn('"expected"', source)
        self.assertNotIn('"gold"', source)
        with self.assertRaises(ValueError):
            self.service.answer("../../etc/passwd")

    def test_api_exposes_only_public_questions_and_structured_answer(self):
        client = TestClient(app)
        catalog = client.get("/api/verified-qa/questions")
        self.assertEqual(catalog.status_code, 200)
        self.assertEqual(len(catalog.json()["questions"]), 22)
        self.assertFalse(any("expected" in q or "gold" in q or "query" in q for q in catalog.json()["questions"]))
        response = client.post("/api/verified-qa/answer", json={"question_id": "Q03"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["path"][0]["relation"], "CONTAINS")
        self.assertEqual(client.post("/api/verified-qa/answer", json={"question_id": "../secret"}).status_code, 404)


if __name__ == "__main__":
    unittest.main()

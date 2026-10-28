"""P6 contracts and structured input formats."""

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from main import app
from ontology_kernel.schema_loader import load_pet_food_schema
from ontology_kernel.versioning import compute_schema_hash
from ontology_registry import OntologyRegistry
from data_pipeline.service import PipelineService
from data_pipeline.source_catalog import SourceCatalog
from verified_qa.service import VerifiedQAService

ROOT = Path(__file__).resolve().parents[2]


class P6AssetTests(unittest.TestCase):
    def test_metric_and_action_contracts_are_typed_and_hash_sensitive(self):
        schema = load_pet_food_schema()
        metric = schema.metrics["ProductCountBySpecies"]
        self.assertEqual((metric.object_type, metric.aggregation, metric.group_by), ("PetFoodProduct", "count", ["target_species"]))
        self.assertEqual(metric.unit, "products")
        action = schema.actions["ExplainProductRisk"]
        self.assertEqual(action.applicable_object_type, "PetFoodProduct")
        self.assertEqual(action.side_effect, "read_only")
        self.assertEqual(action.inputs[0].name, "product_id")
        self.assertEqual(action.executor, "unconfigured")
        self.assertEqual(action.params, ["product_id"])
        before = compute_schema_hash(schema)
        schema.metrics["ProductCountBySpecies"].unit = "items"
        self.assertNotEqual(compute_schema_hash(schema), before)
        public = OntologyRegistry().get_schema()
        self.assertIn("ProductCountBySpecies", public["metrics"])
        self.assertIn("inputs", public["actionTypes"]["ExplainProductRisk"])

    def test_concrete_metric_and_action_questions_have_evidence(self):
        qa = VerifiedQAService(ROOT)
        metric = qa.answer("Q21")
        self.assertEqual((metric.status, metric.value), ("answered", 7))
        self.assertTrue(metric.evidence)
        self.assertTrue(any(item.kind == "metric_evaluation" for item in metric.path))
        action = qa.answer("Q22")
        self.assertEqual((action.status, action.value), ("answered", "product_id"))
        self.assertTrue(any(item.kind == "action_contract" for item in action.path))

    def test_json_and_ndjson_profile_through_same_catalog_and_mapping_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = PipelineService()
            service.source_catalog = SourceCatalog(Path(tmp) / "catalog.json")
            for fmt, content in [("json", '[{"product_id":"PF100","fat_100g":21},{"product_id":"PF101","fat_100g":16}]'), ("ndjson", '{"product_id":"PF100","fat_100g":21}\n{"product_id":"PF101","fat_100g":16}')]:
                profile = service.profile_structured_content(f"products.{fmt}", content, fmt)
                self.assertEqual((profile.row_count, profile.column_count), (2, 2))
                self.assertTrue(profile.source_revision_id)
                self.assertEqual(len(service._rows[profile.source_id]), 2)
                self.assertIn("field_suggestions", service.suggest_mappings(profile.source_id))
                plan = service.create_import_plan(profile.source_id, "pet_food")
                self.assertEqual(plan.metadata["source_type"], f"custom_{fmt}")
                self.assertEqual(plan.metadata["source_revision_id"], profile.source_revision_id)

    def test_invalid_structured_input_is_rejected_before_catalog_registration(self):
        service = PipelineService()
        for fmt, content in [("json", '[1,2]'), ("json", '{"x":1}'), ("ndjson", '{"x":1}\nnot-json'), ("ndjson", ''), ("json", '[]')]:
            with self.subTest(fmt=fmt, content=content):
                with self.assertRaises(ValueError):
                    service.profile_structured_content(f"invalid.{fmt}", content, fmt)

    def test_structured_profile_api(self):
        client = TestClient(app)
        response = client.post("/api/pipeline/profile/json", json={"filename": "pet.json", "content": '[{"product_id":"PF100"}]'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["row_count"], 1)
        self.assertEqual(client.post("/api/pipeline/profile/ndjson", json={"filename": "bad.ndjson", "content": "bad"}).status_code, 400)


if __name__ == "__main__":
    unittest.main()

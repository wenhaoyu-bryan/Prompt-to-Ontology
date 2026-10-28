"""The public pipeline API exposes both directions of source lineage."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import data_pipeline.service as pipeline_module
import main


class SourceApiTests(unittest.TestCase):
    def test_profile_suggest_confirm_and_reverse_lookup(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(pipeline_module, "_SOURCES_FILE", Path(tmp) / "sources.json"), \
                 patch.object(pipeline_module, "_PLANS_FILE", Path(tmp) / "plans.json"):
                service = pipeline_module.PipelineService()
                with patch.object(main, "pipeline_service", service):
                    client = TestClient(main.app)
                    profile_response = client.post("/api/pipeline/profile/sample", json={"sample_name": "pet_food_products"})
                    self.assertEqual(profile_response.status_code, 200)
                    profile = profile_response.json()
                    self.assertTrue(profile["source_asset_id"] and profile["source_revision_id"])

                    suggestions_response = client.post("/api/pipeline/mappings/suggest", json={"source_id": profile["source_id"]})
                    self.assertEqual(suggestions_response.status_code, 200)
                    field = next(s for s in suggestions_response.json()["field_suggestions"] if s["source_column"] == "phosphorus_100g")
                    self.assertEqual(field["mapping_status"], "suggested")

                    decision = client.post("/api/pipeline/mappings/decision", json={
                        "revision_id": profile["source_revision_id"], "field_id": field["source_field_id"],
                        "target_object_type": "PetFoodProduct", "target_property": "phosphorus_100g",
                        "resolution": "same",
                    })
                    self.assertEqual(decision.status_code, 200, decision.text)
                    self.assertEqual(decision.json()["status"], "confirmed")

                    source = client.get(f"/api/pipeline/sources/{profile['source_revision_id']}")
                    self.assertEqual(source.status_code, 200)
                    self.assertEqual(next(f for f in source.json()["fields"] if f["source_column"] == "phosphorus_100g")["mapping"]["status"], "confirmed")

                    target = client.get("/api/pipeline/lineage/target", params={"object_type": "PetFoodProduct", "property_name": "phosphorus_100g"})
                    self.assertEqual(target.status_code, 200)
                    self.assertEqual(target.json()["sources"][0]["source_column"], "phosphorus_100g")


if __name__ == "__main__":
    unittest.main()

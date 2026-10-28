"""Draft edits remain persistent and separate from the checked-in schema."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import main
import schema_drafts


class SchemaDraftTests(unittest.TestCase):
    def test_each_asset_category_can_save_a_review_draft(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(
            schema_drafts, "_DRAFT_FILE", Path(directory) / "schema_drafts.json"
        ):
            client = TestClient(main.app)
            schema = client.get("/api/ontology/pet_food/schema").json()
            for category in ("objectTypes", "linkTypes", "rules", "actionTypes", "metrics"):
                with self.subTest(category=category):
                    name, original = next(iter(schema[category].items()))
                    field = "explanation" if category == "rules" else "description"
                    draft = {**original, field: f"Reviewed {category} draft"}
                    response = client.put(
                        f"/api/ontology/pet_food/drafts/{category}/{name}",
                        json={"definition": draft},
                    )
                    self.assertEqual(response.status_code, 200, response.text)
                    current = client.get("/api/ontology/pet_food/schema").json()
                    self.assertEqual(current[category][name], original)
                    self.assertEqual(current["drafts"][category][name], draft)

    def test_metric_draft_round_trip_without_changing_active_definition(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(
            schema_drafts, "_DRAFT_FILE", Path(directory) / "schema_drafts.json"
        ):
            client = TestClient(main.app)
            url = "/api/ontology/pet_food/schema"
            original = client.get(url).json()["metrics"]["ProductCountBySpecies"]
            draft = {**original, "description": "Count sample products by species (review draft)"}
            save = client.put(
                "/api/ontology/pet_food/drafts/metrics/ProductCountBySpecies",
                json={"definition": draft},
            )
            self.assertEqual(save.status_code, 200, save.text)
            schema = client.get(url).json()
            self.assertEqual(schema["metrics"]["ProductCountBySpecies"], original)
            self.assertEqual(schema["drafts"]["metrics"]["ProductCountBySpecies"], draft)

            discard = client.delete("/api/ontology/pet_food/drafts/metrics/ProductCountBySpecies")
            self.assertEqual(discard.status_code, 200, discard.text)
            self.assertNotIn("ProductCountBySpecies", client.get(url).json()["drafts"].get("metrics", {}))

    def test_rejects_invalid_metric_and_unknown_definition(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(
            schema_drafts, "_DRAFT_FILE", Path(directory) / "schema_drafts.json"
        ):
            client = TestClient(main.app)
            metric = client.get("/api/ontology/pet_food/schema").json()["metrics"]["ProductCountBySpecies"]
            invalid = {**metric, "object_type": "MissingType"}
            response = client.put(
                "/api/ontology/pet_food/drafts/metrics/ProductCountBySpecies",
                json={"definition": invalid},
            )
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(
                client.put("/api/ontology/pet_food/drafts/metrics/Unknown", json={"definition": metric}).status_code,
                422,
            )
            self.assertEqual(client.get("/api/ontology/pet_food/schema").json()["drafts"], {})


if __name__ == "__main__":
    unittest.main()

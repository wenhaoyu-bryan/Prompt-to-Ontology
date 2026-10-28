"""Source identity and mapping decisions survive a service restart."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from data_pipeline.source_catalog import SourceCatalog
from data_pipeline.service import PipelineService
import data_pipeline.service as pipeline_module


class SourceCatalogTests(unittest.TestCase):
    def test_revision_identity_and_bidirectional_lookup(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sources.json"
            catalog = SourceCatalog(path)
            first = catalog.register("upload.csv", "custom_csv", b"product_id,protein\nPF1,27\n", ["product_id", "protein"])
            again = catalog.register("upload.csv", "custom_csv", b"product_id,protein\nPF1,27\n", ["product_id", "protein"])
            changed = catalog.register("upload.csv", "custom_csv", b"product_id,protein\nPF1,28\n", ["product_id", "protein"])
            self.assertEqual(first["asset_id"], changed["asset_id"])
            self.assertEqual(first["revision_id"], again["revision_id"])
            self.assertNotEqual(first["revision_id"], changed["revision_id"])
            self.assertEqual(first["fields"][1]["field_id"], changed["fields"][1]["field_id"])

            field_id = first["fields"][1]["field_id"]
            catalog.propose(first["revision_id"], field_id, "PetFoodProduct", "protein_100g", 0.7)
            self.assertEqual(catalog.source(first["revision_id"])["fields"][1]["mapping"]["status"], "suggested")
            self.assertEqual(catalog.target("PetFoodProduct", "protein_100g"), [])
            catalog.decide(first["revision_id"], field_id, "PetFoodProduct", "protein_100g", "alias")

            restored = SourceCatalog(path)
            source = restored.source(first["revision_id"])
            self.assertEqual(source["fields"][1]["mapping"]["resolution"], "alias")
            reverse = restored.target("PetFoodProduct", "protein_100g")
            self.assertEqual(len(reverse), 1)
            self.assertEqual(reverse[0]["source_name"], "upload.csv")
            self.assertEqual(reverse[0]["source_column"], "protein")
            self.assertEqual(reverse[0]["revision_id"], first["revision_id"])
            self.assertFalse(reverse[0]["is_latest"])
            self.assertEqual(restored.source(changed["revision_id"])["fields"][1]["mapping"], None)

    def test_separate_keeps_field_out_of_target_lookup(self):
        with tempfile.TemporaryDirectory() as tmp:
            catalog = SourceCatalog(Path(tmp) / "sources.json")
            revision = catalog.register("a.csv", "custom_csv", b"protein\n27\n", ["protein"])
            field_id = revision["fields"][0]["field_id"]
            catalog.propose(revision["revision_id"], field_id, "PetFoodProduct", "protein_100g", 0.7)
            catalog.decide(revision["revision_id"], field_id, "", "", "separate")
            self.assertEqual(catalog.target("PetFoodProduct", "protein_100g"), [])
            self.assertEqual(catalog.source(revision["revision_id"])["fields"][0]["mapping"]["status"], "separate")

    def test_cannot_silently_merge_two_fields_into_one_property(self):
        with tempfile.TemporaryDirectory() as tmp:
            catalog = SourceCatalog(Path(tmp) / "sources.json")
            revision = catalog.register("a.csv", "custom_csv", b"protein,protein_g\n27,27\n", ["protein", "protein_g"])
            a, b = [field["field_id"] for field in revision["fields"]]
            catalog.decide(revision["revision_id"], a, "PetFoodProduct", "protein_100g", "same")
            with self.assertRaisesRegex(ValueError, "alias"):
                catalog.decide(revision["revision_id"], b, "PetFoodProduct", "protein_100g", "same")
            catalog.decide(revision["revision_id"], b, "PetFoodProduct", "protein_100g", "alias")
            self.assertEqual(len(catalog.target("PetFoodProduct", "protein_100g")), 2)

    def test_confirmed_decision_changes_import_plan(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(pipeline_module, "_SOURCES_FILE", Path(tmp) / "sources.json"), \
                 patch.object(pipeline_module, "_PLANS_FILE", Path(tmp) / "plans.json"):
                service = PipelineService()
                profile = service.profile_sample("pet_food_products")
                suggestions = service.suggest_mappings(profile.source_id)
                phosphorus = next(s for s in suggestions["field_suggestions"] if s["source_column"] == "phosphorus_100g")
                self.assertEqual(phosphorus["mapping_status"], "suggested")
                service.decide_mapping(profile.source_revision_id, phosphorus["source_field_id"], "", "", "separate")
                plan = service.create_import_plan(profile.source_id)
                self.assertTrue(plan.candidate_objects)
                self.assertFalse(any("phosphorus_100g" in obj.properties for obj in plan.candidate_objects))
                self.assertEqual(plan.metadata["source_revision_id"], profile.source_revision_id)
                self.assertTrue(any(m["status"] == "separate" for m in plan.metadata["mapping_decisions"]))

                restarted = PipelineService()
                source = restarted.source_catalog.source(profile.source_revision_id)
                self.assertEqual(next(f for f in source["fields"] if f["source_column"] == "phosphorus_100g")["mapping"]["status"], "separate")

    def test_manual_mapping_of_unmatched_field_enters_plan(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(pipeline_module, "_SOURCES_FILE", Path(tmp) / "sources.json"), \
                 patch.object(pipeline_module, "_PLANS_FILE", Path(tmp) / "plans.json"):
                service = PipelineService()
                profile = service.profile_csv_content("upload.csv", "product_id,protein_g_per_100g\nPF001,27\n")
                suggestion = next(s for s in service.suggest_mappings(profile.source_id)["field_suggestions"] if s["source_column"] == "protein_g_per_100g")
                self.assertEqual(suggestion["mapping_status"], "suggested")
                with self.assertRaisesRegex(ValueError, "Unknown ontology property"):
                    service.decide_mapping(profile.source_revision_id, suggestion["source_field_id"], "PetFoodProduct", "unknown", "alias")
                service.decide_mapping(profile.source_revision_id, suggestion["source_field_id"], "PetFoodProduct", "protein_100g", "alias")
                plan = service.create_import_plan(profile.source_id)
                self.assertTrue(any(obj.properties.get("protein_100g") == "27" for obj in plan.candidate_objects))

    def test_explicit_empty_mapping_does_not_restore_suggestions(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(pipeline_module, "_SOURCES_FILE", Path(tmp) / "sources.json"), \
                 patch.object(pipeline_module, "_PLANS_FILE", Path(tmp) / "plans.json"):
                service = PipelineService()
                profile = service.profile_sample("pet_food_products")
                plan = service.create_import_plan(profile.source_id, object_mappings=[])
                self.assertEqual(plan.candidate_objects, [])


if __name__ == "__main__":
    unittest.main()

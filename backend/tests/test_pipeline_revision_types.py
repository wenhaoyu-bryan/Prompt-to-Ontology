"""Regression coverage for manual import revisions and typed review candidates."""

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

from fastapi.testclient import TestClient

import data_pipeline.service as pipeline_module
import main
from data_pipeline.models import PlanStatus
from data_pipeline.service import PipelineService
import review_queue.service as review_service


class PipelineRevisionTests(TestCase):
    def setUp(self):
        self.tmp = Path(self.enterContext(TemporaryDirectory()))
        self.enterContext(patch.object(pipeline_module, "_SOURCES_FILE", self.tmp / "sources.json"))
        self.enterContext(patch.object(pipeline_module, "_PLANS_FILE", self.tmp / "plans.json"))
        self.service = PipelineService()

    def test_csv_revisions_keep_separate_profiles_and_rows_after_restart(self):
        first_content = "product_id,product_name,protein_100g\n0007,First,20\n"
        first = self.service.profile_csv_content("upload.csv", first_content)
        second = self.service.profile_csv_content(
            "upload.csv", "product_id,product_name,protein_100g\n0008,Second,24\n"
        )
        self.assertEqual(first.source_id, first.source_revision_id)
        self.assertNotEqual(first.source_id, second.source_id)
        self.assertEqual(first.source_asset_id, second.source_asset_id)

        for service in (self.service, PipelineService()):
            with self.subTest(service=service):
                profile = service.get_profile(first.source_id)
                self.assertEqual(profile.sample_rows[0]["product_id"], "0007")
                self.assertEqual(profile.created_at, first.created_at)
                self.assertEqual(service.suggest_mappings(first.source_id)["source_revision_id"], first.source_id)
                first_plan = service.create_import_plan(first.source_id)
                second_plan = service.create_import_plan(second.source_id)
                self.assertEqual(first_plan.metadata["source_revision_id"], first.source_id)
                self.assertEqual(first_plan.candidate_objects[0].id, "0007")
                self.assertEqual(second_plan.candidate_objects[0].id, "0008")
        self.assertEqual(self.service.profile_csv_content("upload.csv", first_content).source_id, first.source_id)

    def test_structured_upload_cannot_replace_builtin_sample(self):
        sample = self.service.profile_sample("pet_food_products")
        custom = self.service.profile_structured_content(
            sample.source_name, '[{"product_id":"0007","product_name":"Custom"}]', "json"
        )
        self.assertEqual(sample.source_id, "pet_food_products")
        self.assertNotEqual(custom.source_id, sample.source_id)
        self.assertGreater(self.service.get_profile(sample.source_id).row_count, 1)
        restored = PipelineService().create_import_plan(custom.source_id)
        self.assertEqual(restored.candidate_objects[0].id, "0007")

    def test_concurrent_uploads_preserve_both_revisions(self):
        def upload(identifier):
            return self.service.profile_structured_content(
                "products.ndjson", f'{{"product_id":"{identifier}","product_name":"Custom"}}', "ndjson"
            ).source_id

        with ThreadPoolExecutor(max_workers=2) as pool:
            revisions = list(pool.map(upload, ("0007", "0008")))
        restarted = PipelineService()
        self.assertEqual(
            [restarted.create_import_plan(revision).candidate_objects[0].id for revision in revisions],
            ["0007", "0008"],
        )

    def test_plan_converts_schema_numbers_and_preserves_string_identity(self):
        profile = self.service.profile_csv_content(
            "products.csv", "product_id,product_name,barcode,protein_100g\n0007,First,000051,2.75\n"
        )
        plan = self.service.create_import_plan(profile.source_id)
        self.assertEqual(plan.status, PlanStatus.VALIDATED)
        self.assertEqual(plan.candidate_objects[0].properties, {
            "product_id": "0007", "product_name": "First", "barcode": "000051", "protein_100g": 2.75,
        })

    def test_bad_and_non_finite_values_are_reported_by_row_through_api(self):
        with patch.object(main, "pipeline_service", self.service), patch.object(
            review_service, "_pipeline_service", self.service,
        ):
            client = TestClient(main.app)
            response = client.post("/api/pipeline/profile/csv", json={
                "filename": "products.csv",
                "content": "product_id,product_name,protein_100g\n1,First,NaN\n2,Second,1e309\n3,Third,abc\n",
            })
            self.assertEqual(response.status_code, 200)
            plan_response = client.post("/api/pipeline/import-plan", json={"source_id": response.json()["source_id"]})
            self.assertEqual(plan_response.status_code, 200)
            plan = plan_response.json()
            self.assertEqual(plan["status"], "has_errors")
            self.assertEqual(plan["summary"]["validation_errors"], 3)
            self.assertEqual([
                (issue["code"], issue["row"], issue["field"]) for issue in plan["validation_issues"]
            ], [("INVALID_PROPERTY_TYPE", row, "protein_100g") for row in range(3)])
            self.assertTrue(all("protein_100g" not in item["properties"] for item in plan["candidate_objects"]))
            submission = client.post(f"/api/review/from-import-plan/{plan['plan_id']}")
            self.assertEqual(submission.status_code, 400)
            self.assertIn("validation issues", submission.json()["detail"])

    def test_ambiguous_per_100g_alias_requires_explicit_confirmation(self):
        profile = self.service.profile_csv_content(
            "products.csv", "product_id,product_name,protein\n0007,First,2.75\n"
        )
        with patch.object(main, "pipeline_service", self.service):
            client = TestClient(main.app)
            body = {"source_id": profile.source_id}
            plan = client.post("/api/pipeline/import-plan", json=body).json()
            self.assertEqual(plan["status"], "has_errors")
            self.assertEqual(plan["validation_issues"][0]["code"], "UNIT_CONFIRMATION_REQUIRED")
            confirmed = client.post("/api/pipeline/import-plan", json={
                **body, "unit_confirmations": {"protein": "per_100g"},
            }).json()
            self.assertEqual(confirmed["status"], "validated")
            self.assertEqual(confirmed["candidate_objects"][0]["properties"]["protein_100g"], 2.75)
            self.assertEqual(confirmed["metadata"]["unit_confirmations"], {"protein": "per_100g"})

    def test_legacy_plan_with_filename_source_id_remains_readable(self):
        (self.tmp / "plans.json").write_text(json.dumps([{
            "plan_id": "plan-legacy",
            "domain": "pet_food",
            "source_profile": {"source_id": "old.csv", "source_name": "old.csv"},
            "candidate_objects": [{"id": "0007", "type": "PetFoodProduct", "properties": {"protein_100g": "27"}}],
        }]), encoding="utf-8")
        plan = PipelineService().get_import_plan("plan-legacy")
        self.assertEqual(plan.source_profile.source_id, "old.csv")
        self.assertEqual(plan.candidate_objects[0].properties["protein_100g"], "27")

    def test_relationship_plan_reads_the_selected_revision_and_types_known_properties(self):
        old = self.service.profile_csv_content(
            "relations.csv", "product_id,ingredient_id,ingredient_order,proportion_percent\n0007,001,2,7.25\n",
        )
        new = self.service.profile_csv_content(
            "relations.csv", "product_id,ingredient_id,ingredient_order,proportion_percent\n0008,002,2.5,Infinity\n",
        )
        restarted = PipelineService()
        with patch("neo4j_connector.get_driver", side_effect=RuntimeError("offline")):
            old_plan, new_plan = [restarted.create_relationship_import_plan(
                revision.source_id, "pet_food", "CONTAINS", "product_id", "ingredient_id",
                property_columns=["ingredient_order", "proportion_percent"],
            ) for revision in (old, new)]
        link = old_plan.candidate_links[0]
        self.assertEqual((link.source_id, link.target_id), ("0007", "001"))
        self.assertEqual(link.properties, {"ingredient_order": 2, "proportion_percent": 7.25})
        self.assertEqual(old_plan.metadata["source_revision_id"], old.source_revision_id)
        self.assertEqual(new_plan.status, PlanStatus.HAS_ERRORS)
        self.assertEqual(new_plan.summary.validation_errors, 2)

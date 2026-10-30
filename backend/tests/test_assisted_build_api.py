"""HTTP tests for the explicit revision/preview review boundary."""

import tempfile
import unittest
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
import assisted_build_api as boundary
from assisted_build.service import AssistedBuildService

ROOT = Path(__file__).resolve().parents[2]


class AssistedBuildAPITests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        previous = boundary.service
        boundary.service = AssistedBuildService(
            ROOT,
            Path(self.tmp.name),
            graph_reader=lambda ids: {"objects": [], "links": []},
            submitter=lambda *args: None,
        )
        self.addCleanup(setattr, boundary, "service", previous)
        app = FastAPI()
        app.include_router(boundary.router)
        self.client = TestClient(app)

    def create(self):
        response = self.client.post(
            "/api/assisted-build/runs",
            json={
                "goal": "Inspect ingredients",
                "execution_mode": "deterministic",
                "files": [
                    {
                        "name": "renamed.csv",
                        "content": "ingredient_id,ingredient_name\nING-API,Chicken\n",
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 202, response.text)
        return self.client.get(
            "/api/assisted-build/runs/" + response.json()["id"]
        ).json()

    def test_complete_http_flow_is_explicit_and_revision_bound(self):
        run = self.create()
        base = "/api/assisted-build/runs/" + run["id"]
        self.assertEqual(run["status"], "needs_confirmation")
        self.assertTrue(run["sources"][0]["object_mappings"])
        self.assertNotIn("content", run["sources"][0])
        self.assertEqual(
            self.client.post(
                base + "/submit",
                json={"expected_revision": run["revision"], "preview_hash": "absent"},
            ).status_code,
            409,
        )
        preview = self.client.post(
            base + "/preview", json={"expected_revision": run["revision"]}
        )
        self.assertEqual(preview.status_code, 200, preview.text)
        p = preview.json()
        self.assertEqual(p["preview"]["summary"]["errors"], 0, p)
        request = {
            "expected_revision": p["revision"],
            "preview_hash": p["preview"]["hash"],
        }
        submitted = self.client.post(base + "/submit", json=request)
        self.assertEqual(submitted.status_code, 200, submitted.text)
        self.assertEqual(
            self.client.post(base + "/submit", json=request).json()["review_batch_id"],
            submitted.json()["review_batch_id"],
        )
        self.assertEqual(
            self.client.get(base + "/verify").json()["status"], "incomplete"
        )
        self.assertEqual(self.client.delete(base).status_code, 200)
        self.assertEqual(self.client.get(base).status_code, 404)

    def test_file_and_revision_limits_are_http_errors(self):
        self.assertEqual(
            self.client.post(
                "/api/assisted-build/runs", json={"goal": "", "files": []}
            ).status_code,
            422,
        )
        run = self.create()
        self.assertEqual(
            self.client.post(
                "/api/assisted-build/runs/" + run["id"] + "/preview",
                json={"expected_revision": run["revision"] + 1},
            ).status_code,
            409,
        )

    def test_interrupted_task_can_retry_through_http(self):
        run = boundary.service.create(
            "Inspect ingredients",
            [
                {
                    "name": "items.csv",
                    "content": "ingredient_id,ingredient_name\nING-RETRY,Chicken\n",
                }
            ],
            "deterministic",
        )
        boundary.service.recover_interrupted()
        saved = boundary.service.get_run(run["id"])
        self.assertEqual(saved["status"], "interrupted")
        response = self.client.post(
            "/api/assisted-build/runs/" + run["id"] + "/retry",
            json={"expected_revision": saved["revision"]},
        )
        self.assertEqual(response.status_code, 202, response.text)
        recovered = self.client.get("/api/assisted-build/runs/" + run["id"]).json()
        self.assertEqual(recovered["status"], "needs_confirmation")
        self.assertGreater(recovered["revision"], saved["revision"])
        stale = self.client.post(
            "/api/assisted-build/runs/" + run["id"] + "/retry",
            json={"expected_revision": saved["revision"]},
        )
        self.assertEqual(stale.status_code, 409)

    def test_malformed_csv_is_not_accepted_as_a_finished_task(self):
        response = self.client.post(
            "/api/assisted-build/runs",
            json={
                "goal": "Inspect",
                "files": [{"name": "bad.csv", "content": "a,a\n1,2\n"}],
            },
        )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()

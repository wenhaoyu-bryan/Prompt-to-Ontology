import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import assisted_build_api as api
from assisted_build.schema_design import SchemaDesignService


DDL = "CREATE TABLE lot (lot_no VARCHAR(40) PRIMARY KEY, status VARCHAR(32));"
SOP = "# Release SOP\r\n\r\n## Quality hold\r\nHeld lots cannot ship.\r\nRelease requires approval.\r\n"


class DdlDocumentAssistanceTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        service = SchemaDesignService(Path(__file__).resolve().parents[2], temp.name)
        replacement = patch.object(api, "schema_design_service", service)
        replacement.start()
        self.addCleanup(replacement.stop)
        app = FastAPI()
        app.include_router(api.router)
        self.client = TestClient(app)
        self.endpoint = "/api/assisted-build/schema-designs"
        self.payload = {
            "goal": "Describe lot release",
            "files": [{"name": "schema.sql", "content": DDL}],
            "reference_documents": [{"name": "release.md", "content": SOP}],
            "execution_mode": "auto",
        }

    def create(self, model):
        with patch.object(api, "get_agent_llm_config", return_value={
            "provider": "openai_compatible", "api_key": "test-only",
        }), patch("llm_client._call_llm", side_effect=model):
            response = self.client.post(self.endpoint, json=self.payload)
        self.assertEqual(response.status_code, 202, response.text)
        self.assertNotIn(SOP, response.text)
        url = f"{self.endpoint}/{response.json()['id']}"
        return url, self.client.get(url).json()

    def proposal(self, messages, quote="Held lots cannot ship."):
        context = json.loads(messages[-1]["content"])
        document, = context["reference_documents"]
        self.assertEqual(document["lines"][3], "Held lots cannot ship.")
        prop = next(x for x in context["candidates"] if x.get("column") == "status")
        citation = {"document_id": document["id"], "start_line": 4, "end_line": 4, "quote": quote}
        return {"message": {"content": json.dumps({"suggestions": [
            {"id": prop["id"], "description": "Quality hold prevents shipment", "citation": citation},
            {"kind": "rule", "title": "Shipment hold", "description": "Block shipment of held lots", "citation": citation},
        ]})}}

    def test_document_citations_survive_edit_and_export_as_original_suggestions(self):
        url, run = self.create(self.proposal)
        document, = run["reference_documents"]
        prop, rule = run["document_suggestions"]
        self.assertEqual((prop["kind"], rule["kind"]), ("property", "rule"))
        self.assertEqual(prop["citation"], {
            "document_id": document["id"], "name": "release.md", "heading": "Quality hold",
            "start_line": 4, "end_line": 4, "quote": "Held lots cannot ship.",
        })
        self.assertEqual(self.client.get(f"{url}/documents/{document['id']}").json()["content"], SOP)
        self.assertEqual(self.client.get(f"{url}/documents/unknown").status_code, 404)
        obj, = run["objects"]
        status = next(p for p in obj["properties"] if p["name"] == "status")
        self.assertEqual(status["description"], prop["description"])
        self.assertEqual((obj["primary_key"], status["source_column"], obj["decision"]), ("lot_no", "status", "pending"))
        status["description"] = "Reviewed status wording"
        obj["decision"] = "accepted"
        update = self.client.put(f"{url}/definitions", json={
            "expected_revision": run["revision"], "objects": [obj], "links": [],
        })
        self.assertEqual(update.status_code, 200, update.text)
        preview = self.client.post(f"{url}/preview", json={"expected_revision": update.json()["revision"]}).json()
        saved = self.client.post(f"{url}/save", json={
            "expected_revision": preview["revision"], "preview_hash": preview["preview"]["hash"],
        })
        self.assertEqual(saved.status_code, 200, saved.text)
        package = self.client.get(f"{url}/export").json()
        files = {file["name"]: file["content"] for file in package["files"]}
        receipt = json.loads(files["schema-design.json"])
        self.assertEqual(receipt["document_suggestions"], [prop, rule])
        self.assertNotIn("Release requires approval.", files["schema-design.json"])
        self.assertNotIn("Shipment hold", files["object_types.yaml"])
        self.assertIn("Reviewed status wording", files["object_types.yaml"])
        self.assertEqual(self.client.delete(url).status_code, 200)
        self.assertEqual(self.client.get(f"{url}/documents/{document['id']}").status_code, 404)

    def test_fabricated_quote_does_not_change_the_parsed_draft(self):
        _, run = self.create(lambda messages: self.proposal(messages, quote="Invented citation"))
        self.assertEqual(run["document_suggestions"], [])
        self.assertEqual(run["steps"][-1]["status"], "fallback")
        self.assertEqual(run["objects"][0]["properties"][1]["description"], "SQL column status (VARCHAR(32))")

    def test_documents_require_explicit_auto_and_ddl(self):
        for overrides in (
            {"execution_mode": "deterministic"},
            {"files": [{"name": "lot.csv", "content": "lot_id\nLOT01\n"}]},
            {"reference_documents": [{"name": "release.pdf", "content": SOP}]},
        ):
            with self.subTest(overrides=overrides), patch("llm_client._call_llm") as model:
                response = self.client.post(self.endpoint, json={**self.payload, **overrides})
                self.assertEqual(response.status_code, 400, response.text)
                model.assert_not_called()
        self.payload.pop("execution_mode")
        self.assertEqual(self.client.post(self.endpoint, json=self.payload).status_code, 400)

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import assisted_build_api as api
from assisted_build.schema_design import SchemaDesignService
from llm_config_manager import get_active_llm_config


DDL = """
CREATE TABLE vendor (id BIGINT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE lot (lot_no TEXT PRIMARY KEY, vendor_id BIGINT REFERENCES vendor(id));
COMMENT ON TABLE vendor IS 'Original vendor comment';
"""


class DdlAgentAssistanceTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        service = SchemaDesignService(Path(__file__).resolve().parents[2], temp.name)
        replace = patch.object(api, "schema_design_service", service)
        replace.start()
        self.addCleanup(replace.stop)
        app = FastAPI()
        app.include_router(api.router)
        self.client = TestClient(app)

    def analyze(self, mode):
        payload = {
            "goal": "Name suppliers and production lots",
            "files": [{"name": "schema.sql", "content": DDL}],
        }
        if mode is not None:
            payload["execution_mode"] = mode
        response = self.client.post("/api/assisted-build/schema-designs", json=payload)
        self.assertEqual(response.status_code, 202, response.text)
        return self.client.get(
            "/api/assisted-build/schema-designs/" + response.json()["id"]
        ).json()

    def test_auto_uses_build_provider_and_overlays_only_editable_semantics(self):
        def suggest(messages):
            self.assertEqual(get_active_llm_config()["model"], "build-test-model")
            context = json.loads(messages[-1]["content"])
            entries = context["candidates"]
            vendor = next(x for x in entries if x["kind"] == "object" and x["table"] == "vendor")
            prop = next(x for x in entries if x["kind"] == "property" and x["column"] == "name")
            link = next(x for x in entries if x["kind"] == "relationship")
            self.assertNotIn("CREATE TABLE", messages[-1]["content"])
            self.assertNotIn("build-test-key", messages[-1]["content"])
            return {"message": {"content": json.dumps({"suggestions": [
                {"id": vendor["id"], "label": "Supplier"},
                {"id": prop["id"], "description": "Registered supplier name"},
                {"id": link["id"], "label": "Supplied by"},
            ]})}}

        with patch.object(api, "get_agent_llm_config", return_value={
            "provider": "openai_compatible", "model": "build-test-model", "api_key": "build-test-key"
        }) as get_config, patch("llm_client._call_llm", side_effect=suggest) as model:
            run = self.analyze("auto")
        get_config.assert_called_once_with("build")
        model.assert_called_once()
        vendor = next(x for x in run["objects"] if x["name"] == "Vendor")
        self.assertEqual((vendor["label"], vendor["primary_key"], vendor["decision"]), ("Supplier", "id", "pending"))
        self.assertEqual(next(x for x in vendor["properties"] if x["name"] == "name")["description"], "Registered supplier name")
        link, = run["links"]
        self.assertEqual((link["label"], link["from"], link["to"], link["target_column"]), ("Supplied by", "Lot", "Vendor", "vendor_id"))
        self.assertEqual(run["steps"][-1]["status"], "completed")
        self.assertNotIn("build-test-key", json.dumps(run))

    def test_structural_model_edit_discards_the_whole_proposal(self):
        def suggest(messages):
            vendor, lot, *_ = json.loads(messages[-1]["content"])["candidates"]
            return {"message": {"content": json.dumps({"suggestions": [
                {"id": vendor["id"], "label": "Invented supplier"},
                {"id": lot["id"], "primary_key": "vendor_id"},
            ]})}}

        with patch.object(api, "get_agent_llm_config", return_value={
            "provider": "openai_compatible", "api_key": "test-key"
        }), patch("llm_client._call_llm", side_effect=suggest):
            run = self.analyze("auto")
        vendor = next(x for x in run["objects"] if x["name"] == "Vendor")
        self.assertEqual((vendor["label"], vendor["primary_key"]), ("Vendor", "id"))
        self.assertEqual(run["steps"][-1]["status"], "fallback")
        self.assertEqual(run["status"], "needs_confirmation")

    def test_ddl_without_a_configured_model_and_deterministic_mode_do_not_call_model(self):
        with patch.object(api, "get_agent_llm_config", return_value={}) as get_config, patch("llm_client._call_llm") as model:
            self.assertEqual(self.analyze("auto")["steps"][-1]["status"], "fallback")
            self.assertEqual(self.analyze("deterministic")["steps"][-1]["method"], "ddl")
            self.assertEqual(self.analyze(None)["execution_mode"], "deterministic")
        get_config.assert_called_once_with("build")
        model.assert_not_called()

    def test_mysql_dialect_is_retained_from_api_to_reviewed_export(self):
        response = self.client.post("/api/assisted-build/schema-designs", json={
            "goal": "Track suppliers and lots",
            "files": [{"name": "schema.sql", "content": """
                CREATE TABLE `supply`.`vendor` (
                    `id` BIGINT UNSIGNED PRIMARY KEY
                ) ENGINE=InnoDB COMMENT='Vendors';
                CREATE TABLE `supply`.`lot` (
                    `id` BIGINT UNSIGNED PRIMARY KEY,
                    `vendor_id` BIGINT UNSIGNED,
                    CONSTRAINT fk_vendor FOREIGN KEY (vendor_id) REFERENCES vendor(id)
                ) ENGINE=InnoDB;
            """}],
            "ddl_dialect": "mysql",
        })
        self.assertEqual(response.status_code, 202, response.text)
        endpoint = "/api/assisted-build/schema-designs/" + response.json()["id"]
        run = self.client.get(endpoint).json()
        self.assertEqual(run["ddl_dialect"], "mysql")
        self.assertEqual(run["execution_mode"], "deterministic")
        self.assertEqual(run["objects"][0]["description"], "Vendors")
        self.assertEqual(run["links"][0]["target_column"], "vendor_id")
        for item in run["objects"] + run["links"]:
            item["decision"] = "accepted"
        updated = self.client.put(endpoint + "/definitions", json={
            "expected_revision": run["revision"],
            "objects": run["objects"],
            "links": run["links"],
        })
        self.assertEqual(updated.status_code, 200, updated.text)
        preview = self.client.post(endpoint + "/preview", json={
            "expected_revision": updated.json()["revision"],
        })
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertEqual(preview.json()["preview"]["summary"]["errors"], 0)
        saved = self.client.post(endpoint + "/save", json={
            "expected_revision": preview.json()["revision"],
            "preview_hash": preview.json()["preview"]["hash"],
        })
        self.assertEqual(saved.status_code, 200, saved.text)
        response = self.client.get(endpoint + "/export")
        self.assertEqual(response.status_code, 200, response.text)
        files = {file["name"]: file["content"] for file in response.json()["files"]}
        source = json.loads(files["source_mappings.json"])["ddl_sources"][0]
        self.assertEqual(source["dialect"], "mysql")
        self.assertEqual(source["columns"][0]["sql_type"], "BIGINT UNSIGNED")

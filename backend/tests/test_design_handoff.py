import tempfile
import unittest
import copy
import json
from pathlib import Path

from assisted_build.schema_design import SchemaDesignService
from ontology_design.handoff import definitions_from_build


class DesignHandoffTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        service = SchemaDesignService(Path(__file__).resolve().parents[2], temp.name)
        self.build_service = service
        self.storage_root = temp.name
        run = service.create("Describe suppliers and batches", [{"name": "supply.sql", "content": """
            CREATE TABLE supplier (supplier_id VARCHAR(40) PRIMARY KEY, name TEXT);
            CREATE TABLE lot (lot_no VARCHAR(40) PRIMARY KEY, supplier_id VARCHAR(40),
                FOREIGN KEY (supplier_id) REFERENCES supplier(supplier_id));
        """}], "deterministic")
        run = service.analyze(run["id"])
        for item in run["objects"] + run["links"]:
            item["decision"] = "accepted"
        run = service.update(run["id"], run["revision"], run["objects"], run["links"])
        run = service.preview(run["id"], run["revision"])
        service.save(run["id"], run["revision"], run["preview"]["hash"])
        self.package = service.export(run["id"])
        self.revision = run["revision"]

    def test_saved_candidates_keep_field_and_relationship_sources(self):
        objects, links = definitions_from_build(self.package, {"object_types": {}, "link_types": {}}, self.revision)
        supplier = next(item for item in objects if item["name"] == "Supplier")
        prop = next(item for item in supplier["properties"] if item["name"] == "supplier_id")
        self.assertEqual(prop["source_bindings"][0]["source_field"], "supplier_id")
        self.assertEqual(prop["source_bindings"][0]["source_name"], "supply.sql")
        self.assertEqual(prop["source_bindings"][0]["table"], "supplier")
        self.assertEqual(prop["source_bindings"][0]["status"], "imported")
        self.assertEqual(links[0]["source_type"], "Lot")
        self.assertEqual(links[0]["source_bindings"][0]["source_field"], "supplier_id")

    def test_catalog_collision_and_stale_design_are_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "already exists"):
            definitions_from_build(self.package, {"object_types": {"Supplier": {}}, "link_types": {}}, self.revision)
        with self.assertRaisesRegex(RuntimeError, "revision"):
            definitions_from_build(self.package, {"object_types": {}, "link_types": {}}, self.revision + 1)

    def test_unmapped_inherited_field_is_not_recorded_as_imported(self):
        package = copy.deepcopy(self.package)
        receipt = next(file for file in package["files"] if file["name"] == "schema-design.json")
        run = json.loads(receipt["content"])
        run["links"] = []
        candidate = run["objects"][0]
        run["objects"] = [candidate]
        for prop in candidate["properties"]:
            if prop["name"] != candidate["primary_key"]:
                prop["source_column"] = ""
        change = next(item for item in run["preview"]["definitions"] if item["name"] == candidate["name"])
        change["change"] = "reuse"
        change["before"] = copy.deepcopy(change["after"])
        run["preview"]["definitions"] = [change]
        receipt["content"] = json.dumps(run)
        catalog = {"object_types": {candidate["name"]: change["before"]}, "link_types": {}}
        objects, _ = definitions_from_build(package, catalog, self.revision)
        inherited = next(prop for prop in objects[0]["properties"] if prop["name"] != candidate["primary_key"])
        self.assertEqual(inherited["source_bindings"], [])

    def test_http_handoff_saves_one_atomic_catalog_change(self):
        from unittest.mock import patch
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        import assisted_build_api
        from ontology_design.service import OntologyDesignService

        catalog = OntologyDesignService(storage_path=Path(self.storage_root) / "catalog.json")
        app = FastAPI()
        app.include_router(assisted_build_api.router)
        client = TestClient(app)
        previous = catalog.get_catalog("pet_food")
        with patch.object(assisted_build_api, "schema_design_service", self.build_service), patch("ontology_design.service.service", catalog):
            endpoint = f"/api/assisted-build/schema-designs/{self.package['manifest']['id']}/catalog"
            payload = {"expected_revision": previous["revision"], "design_revision": self.revision}
            response = client.post(endpoint, json=payload)
            self.assertEqual(response.status_code, 200, response.text)
            saved = response.json()
            self.assertEqual(saved["revision"], previous["revision"] + 1)
            self.assertIn("Supplier", saved["object_types"])
            self.assertIn("Lot", saved["object_types"])
            self.assertTrue(saved["link_types"])
            prop = saved["object_types"]["Supplier"]["properties"][0]
            self.assertEqual(prop["source_bindings"][0]["status"], "imported")
            self.assertEqual(client.post(endpoint, json=payload).status_code, 409)

import copy
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ontology_design.service import OntologyDesignService
import ontology_design.api as api


ROOT = Path(__file__).resolve().parents[2]


def object_definition(name="Supplier"):
    return {
        "name": name, "label": name, "primary_key": "id", "display_name": "id",
        "properties": [{"name": "id", "type": "string", "required": True}],
    }


class OntologyDesignTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.service = OntologyDesignService(ROOT, Path(self.temp.name) / "design.json")

    def test_batch_is_atomic_persistent_and_stale_writes_fail(self):
        original = self.service.get_catalog("pet_food")
        objects = [object_definition(), object_definition("Lot")]
        links = [{"name": "SUPPLIED_BY", "source_type": "Lot", "target_type": "Supplier",
                  "cardinality": "MANY_TO_ONE", "properties": [{"name": "share", "type": "number", "unit": "%"}]}]
        saved = self.service.save_batch("pet_food", original["revision"], objects, links)
        self.assertEqual(saved["revision"], original["revision"] + 1)
        self.assertEqual(saved["link_types"]["SUPPLIED_BY"]["properties"][0]["unit"], "%")
        reopened = OntologyDesignService(ROOT, Path(self.temp.name) / "design.json").get_catalog("pet_food")
        self.assertEqual(saved, reopened)
        with self.assertRaises(RuntimeError):
            self.service.save_batch("pet_food", original["revision"], [object_definition("New")], [])
        bad = [{"name": "BAD_LINK", "source_type": "Missing", "target_type": "Supplier"}]
        with self.assertRaises(ValueError):
            self.service.save_batch("pet_food", saved["revision"], [object_definition("New")], bad)
        self.assertNotIn("New", self.service.get_catalog("pet_food")["object_types"])
        self.assertEqual(len(saved["changes"]), 1)
        self.assertTrue(saved["changes"][0]["at"])

    def test_primary_keys_and_referenced_properties_are_validated(self):
        original = self.service.get_catalog("pet_food")
        invalid = object_definition()
        invalid["properties"][0]["type"] = "integer"
        with self.assertRaises(ValueError):
            self.service.save_batch("pet_food", original["revision"], [invalid], [])
        invalid = object_definition()
        invalid["properties"].append(copy.deepcopy(invalid["properties"][0]))
        with self.assertRaises(ValueError):
            self.service.save_batch("pet_food", original["revision"], [invalid], [])
        product = copy.deepcopy(original["object_types"]["PetFoodProduct"])
        product["properties"] = [prop for prop in product["properties"] if prop["name"] != "target_species"]
        with self.assertRaises(ValueError):
            self.service.save_batch("pet_food", original["revision"], [product], [])

    def test_manual_references_cannot_claim_imported_provenance(self):
        catalog = self.service.get_catalog("pet_food")
        definition = object_definition()
        binding = {"kind": "ddl", "source_name": "supply.sql", "source_field": "id", "status": "imported"}
        definition["properties"][0]["source_bindings"] = [binding]
        saved = self.service.save_batch("pet_food", catalog["revision"], [definition], [])
        self.assertEqual(saved["object_types"]["Supplier"]["properties"][0]["source_bindings"][0]["status"], "manual")
        manual = copy.deepcopy(saved["object_types"]["Supplier"])
        manual["label"] = "Manual supplier"
        saved = self.service.save_batch("pet_food", saved["revision"], [manual], [])
        self.assertEqual(saved["object_types"]["Supplier"]["properties"][0]["source_bindings"][0]["status"], "manual")
        saved = self.service.save_batch("pet_food", saved["revision"], [manual], [], trusted_sources=True)
        self.assertEqual(saved["object_types"]["Supplier"]["properties"][0]["source_bindings"][0]["status"], "manual")
        definition["name"] = "Lot"
        saved = self.service.save_batch("pet_food", saved["revision"], [definition], [], trusted_sources=True)
        lot = saved["object_types"]["Lot"]
        self.assertEqual(lot["properties"][0]["source_bindings"][0]["status"], "imported")
        saved = self.service.save_batch("pet_food", saved["revision"], [lot], [])
        self.assertEqual(saved["object_types"]["Lot"]["properties"][0]["source_bindings"][0]["status"], "imported")

    def test_http_rejects_stale_revision_and_unsafe_names(self):
        previous = api.service
        api.service = self.service
        self.addCleanup(setattr, api, "service", previous)
        app = FastAPI()
        app.include_router(api.router)
        client = TestClient(app)
        endpoint = "/api/ontology/pet_food/design"
        catalog = client.get(endpoint).json()
        body = {"expected_revision": catalog["revision"], "object_types": [object_definition()], "link_types": []}
        self.assertEqual(client.post(endpoint + "/definitions", json=body).status_code, 200)
        self.assertEqual(client.post(endpoint + "/definitions", json=body).status_code, 409)
        body["expected_revision"] += 1
        body["object_types"][0]["name"] = "../../outside"
        self.assertEqual(client.post(endpoint + "/definitions", json=body).status_code, 422)
        self.assertEqual(client.get("/api/ontology/unknown/design").status_code, 404)

    def test_create_only_rejects_existing_name_without_overwriting(self):
        catalog = self.service.get_catalog("pet_food")
        saved = self.service.save_batch("pet_food", catalog["revision"], [object_definition()], [])
        incoming = object_definition()
        incoming["label"] = "Overwritten supplier"
        with self.assertRaisesRegex(RuntimeError, "already exists"):
            self.service.save_batch("pet_food", saved["revision"], [incoming], [], create_only=True)
        self.assertEqual(self.service.get_catalog("pet_food")["object_types"]["Supplier"]["label"], "Supplier")

    def test_http_numeric_default_overflow_is_a_validation_error(self):
        previous = api.service
        api.service = self.service
        self.addCleanup(setattr, api, "service", previous)
        app = FastAPI()
        app.include_router(api.router)
        client = TestClient(app)
        definition = object_definition()
        definition["properties"].append({"name": "amount", "type": "number", "default": 10 ** 400})
        endpoint = "/api/ontology/pet_food/design/definitions"
        payload = {"expected_revision": 1, "object_types": [definition], "link_types": []}
        self.assertEqual(client.post(endpoint, json=payload).status_code, 422)
        definition["properties"][1]["type"] = "integer"
        self.assertEqual(client.post(endpoint, json=payload).status_code, 200)

import json
import tempfile
import unittest
from pathlib import Path

from assisted_build.schema_design import SchemaDesignService


ROOT = Path(__file__).resolve().parents[2]
DDL = """
CREATE TABLE supply.vendor (id BIGINT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE supply.lot (
    lot_no TEXT PRIMARY KEY,
    vendor_ref BIGINT NOT NULL REFERENCES supply.vendor(id),
    received_at TIMESTAMP
);
"""


class DdlSchemaDesignTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.service = SchemaDesignService(ROOT, temp.name)

    def design(self, ddl):
        created = self.service.create(
            "Track suppliers for each lot", [{"name": "supply.sql", "content": ddl}],
            "deterministic",
        )
        return self.service.analyze(created["id"])

    def test_declared_keys_produce_reviewable_typed_draft_with_lineage(self):
        run = self.design(DDL)
        self.assertEqual(run["source_kind"], "ddl")
        self.assertTrue(all(s["row_count"] == 0 for s in run["sources"]))
        by_name = {o["name"]: o for o in run["objects"]}
        self.assertEqual(by_name["Vendor"]["primary_key"], "id")
        vendor = {p["name"]: p for p in by_name["Vendor"]["properties"]}
        self.assertEqual(vendor["id"]["type"], "string")
        self.assertTrue(vendor["name"]["required"])
        lot = {p["name"]: p for p in by_name["Lot"]["properties"]}
        self.assertEqual(lot["received_at"]["type"], "datetime")
        link, = run["links"]
        self.assertEqual((link["from"], link["to"], link["target_column"]), ("Lot", "Vendor", "vendor_ref"))
        self.assertTrue(all(x["decision"] == "pending" for x in run["objects"] + run["links"]))
        for item in run["objects"] + run["links"]:
            item["decision"] = "accepted"
        updated = self.service.update(run["id"], run["revision"], run["objects"], run["links"])
        preview = self.service.preview(run["id"], updated["revision"])
        self.assertEqual(preview["preview"]["summary"]["errors"], 0)
        self.service.save(run["id"], preview["revision"], preview["preview"]["hash"])
        package = self.service.export(run["id"])
        mappings = json.loads(next(f["content"] for f in package["files"] if f["name"] == "source_mappings.json"))
        self.assertEqual(mappings["ddl_sources"][0]["table"]["name"], "supply.vendor")
        self.assertEqual(mappings["ddl_sources"][1]["table"]["foreign_keys"][0]["target_columns"], ["id"])

    def test_composite_key_is_not_guessed(self):
        run = self.design("CREATE TABLE bridge (a INT, b INT, PRIMARY KEY (a, b));")
        obj, = run["objects"]
        self.assertEqual(obj["primary_key"], "")
        self.assertEqual(run["sources"][0]["table"]["primary_key"], ["a", "b"])

    def test_sql_query_is_rejected_without_creating_a_run(self):
        with self.assertRaises(ValueError):
            self.design("SELECT * FROM vendor;")
        self.assertEqual(self.service.list_runs(), [])

    def test_postgres_comments_provide_editable_business_context(self):
        run = self.design(
            DDL + """
COMMENT ON TABLE supply.vendor IS 'A supplier approved to provide ingredients';
COMMENT ON COLUMN supply.vendor.name IS 'Legal supplier name';
"""
        )
        vendor = next(item for item in run["objects"] if item["name"] == "Vendor")
        name = next(prop for prop in vendor["properties"] if prop["name"] == "name")
        self.assertEqual(vendor["description"], "A supplier approved to provide ingredients")
        self.assertEqual(name["description"], "Legal supplier name")
        self.assertEqual(vendor["decision"], "pending")

    def test_edit_cannot_bind_a_relationship_to_an_unrelated_column(self):
        run = self.design(DDL)
        for item in run["objects"] + run["links"]:
            item["decision"] = "accepted"
        run["links"][0]["target_column"] = "received_at"
        updated = self.service.update(run["id"], run["revision"], run["objects"], run["links"])
        preview = self.service.preview(run["id"], updated["revision"])
        self.assertIn("DDL_FK_BINDING", {issue["code"] for issue in preview["preview"]["issues"]})

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from assisted_build.service import AssistedBuildService

ROOT = Path(__file__).resolve().parents[2]


class AssistedFixture:
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.calls = []
        self.graph = {"objects": [], "links": []}
        self.s = AssistedBuildService(
            ROOT,
            Path(self.tmp.name),
            lambda ids: self.graph,
            lambda batch, run, preview: self.calls.append(batch),
        )

    def tearDown(self):
        self.tmp.cleanup()

    def run_file(self, content="product_id,product_name\np1,Food\n"):
        r = self.s.create("Import", [{"name": "renamed.anything", "content": content}])
        return self.s.analyze(r["id"])


class AssistedTests(AssistedFixture, unittest.TestCase):
    def test_persistence_revision_idempotence_and_delete(self):
        r = self.run_file()
        self.assertEqual(r["sources"][0]["format"], "csv")
        other = AssistedBuildService(
            ROOT, Path(self.tmp.name), lambda ids: self.graph, self.s.submitter
        )
        self.assertEqual(other.get_run(r["id"])["sources"], r["sources"])
        with self.assertRaises(RuntimeError):
            self.s.preview(r["id"], 99)
        r = self.s.preview(r["id"], r["revision"])
        self.assertEqual(r["preview"]["summary"]["errors"], 0)
        r = self.s.submit(r["id"], r["revision"], r["preview"]["hash"])
        self.s.submit(r["id"], r["revision"], r["preview"]["hash"])
        self.assertEqual(len(self.calls), 1)
        with self.assertRaises(RuntimeError):
            self.s.update_mappings(r["id"], r["revision"], r["sources"])
        self.assertFalse(self.s.verify(r["id"])["applied"])
        self.s.delete(r["id"])
        self.assertEqual(self.s.list_runs(), [])

    def test_unit_and_invalid_data_block(self):
        r = self.run_file(
            "product_id,product_name,protein,target_species\np1,Food,30,bird\n"
        )
        r = self.s.preview(r["id"], r["revision"])
        codes = {i["code"] for i in r["issues"]}
        self.assertIn("UNIT_CONFIRMATION_REQUIRED", codes)
        self.assertIn("INVALID_ENUM_VALUE", codes)
        with self.assertRaises(ValueError):
            self.s.submit(r["id"], r["revision"], r["preview"]["hash"])

    def test_cross_source_and_duplicate_conflict(self):
        r = self.s.create(
            "Import",
            [
                {
                    "name": "a",
                    "content": "product_id,product_name,brand_id\np1,Food,b1\n",
                },
                {"name": "b", "content": "brand_id,brand_name\nb1,Brand\n"},
            ],
        )
        r = self.s.analyze(r["id"])
        r = self.s.preview(r["id"], r["revision"])
        self.assertEqual(r["preview"]["summary"]["errors"], 0)
        self.assertEqual(len(r["preview"]["links"]), 1)
        r = self.run_file("product_id,product_name\np1,One\np1,Two\n")
        r = self.s.preview(r["id"], r["revision"])
        self.assertIn("CONFLICTING_ID", {i["code"] for i in r["issues"]})

    def test_edits_schema_drift_and_graph_failure(self):
        r = self.run_file()
        r = self.s.preview(r["id"], r["revision"])
        old = r["preview"]["hash"]
        r = self.s.update_mappings(r["id"], r["revision"], r["sources"])
        self.assertIsNone(r["preview"])
        with self.assertRaises(RuntimeError):
            self.s.submit(r["id"], r["revision"], old)
        self.s.graph_reader = lambda ids: (_ for _ in ()).throw(Exception("secret"))
        r = self.s.preview(r["id"], r["revision"])
        self.assertIn("GRAPH_UNAVAILABLE", {i["code"] for i in r["issues"]})
        self.assertNotIn("secret", str(r))

    def test_renamed_headers_explicit_mapping_and_diff(self):
        r = self.run_file("key,title\np1,New\n")
        src = r["sources"][0]
        src["object_mappings"] = [
            {
                "object_type": "PetFoodProduct",
                "id_column": "key",
                "field_mappings": [
                    {
                        "source_column": "title",
                        "target_object_type": "PetFoodProduct",
                        "target_property": "product_name",
                    }
                ],
            }
        ]
        self.graph["objects"] = [
            {
                "id": "p1",
                "type": "PetFoodProduct",
                "properties": {"product_id": "p1", "product_name": "Old"},
            }
        ]
        r = self.s.update_mappings(r["id"], r["revision"], [src])
        r = self.s.preview(r["id"], r["revision"])
        self.assertEqual(
            r["preview"]["objects"][0]["property_diffs"]["product_name"],
            {"before": "Old", "after": "New"},
        )

    def test_unknown_endpoint_and_schema_drift(self):
        r = self.run_file("product_id,product_name,brand_id\np1,Food,missing\n")
        # Treat brand_id solely as a relationship endpoint, not a new Brand.
        sources = r["sources"]
        sources[0]["object_mappings"] = [
            m
            for m in sources[0]["object_mappings"]
            if m["object_type"] == "PetFoodProduct"
        ]
        r = self.s.update_mappings(r["id"], r["revision"], sources)
        r = self.s.preview(r["id"], r["revision"])
        self.assertIn("LINK_TARGET_NOT_FOUND", {i["code"] for i in r["issues"]})
        with patch.object(
            self.s, "schema_snapshot", return_value={"schema_hash": "changed"}
        ):
            with self.assertRaises(RuntimeError):
                self.s.preview(r["id"], r["revision"])

    def test_auto_semantic_mapping_and_fallback_are_honest(self):
        import sys, types

        fake = types.ModuleType("llm_client")
        fake._extract_json = __import__("json").loads
        fake._call_llm = lambda messages: {
            "message": {
                "content": __import__("json").dumps(
                    {
                        "sources": [
                            {
                                "id": "source-1",
                                "object_mappings": [
                                    {
                                        "object_type": "Brand",
                                        "id_column": "key",
                                        "field_mappings": [
                                            {
                                                "source_column": "title",
                                                "target_object_type": "Brand",
                                                "target_property": "brand_name",
                                            }
                                        ],
                                    }
                                ],
                            }
                        ]
                    }
                )
            }
        }
        with patch.dict(sys.modules, {"llm_client": fake}):
            r = self.s.create(
                "Brands",
                [{"name": "arbitrary", "content": "key,title\nb1,Brand\n"}],
                "auto",
            )
            r = self.s.analyze(r["id"])
        self.assertEqual(r["sources"][0]["object_mappings"][0]["object_type"], "Brand")
        self.assertTrue(any(x["method"] == "llm_client._call_llm" for x in r["steps"]))
        fake._call_llm = lambda messages: (_ for _ in ()).throw(
            Exception("secret-provider-error")
        )
        with patch.dict(sys.modules, {"llm_client": fake}):
            r = self.s.create(
                "Brands",
                [{"name": "x", "content": "brand_id,brand_name\nb1,Brand\n"}],
                "auto",
            )
            r = self.s.analyze(r["id"])
        self.assertTrue(any(x["status"] == "fallback" for x in r["steps"]))
        self.assertNotIn("secret-provider-error", str(r))

    def test_default_review_adapter_has_stable_ids_and_lineage(self):
        from review_queue import storage

        r = self.run_file()
        r = self.s.preview(r["id"], r["revision"])
        with patch.object(
            storage, "_RUNTIME_DIR", Path(self.tmp.name) / "queue"
        ), patch.object(
            storage, "_ITEMS_FILE", Path(self.tmp.name) / "queue/items.json"
        ), patch.object(
            storage, "_BATCHES_FILE", Path(self.tmp.name) / "queue/batches.json"
        ):
            self.s._submit_review("batch-stable", r, r["preview"])
            self.s._submit_review("batch-stable", r, r["preview"])
            self.assertEqual(len(storage.load_batches()), 1)
            self.assertEqual(len(storage.load_items()), 1)
            self.assertEqual(
                storage.load_items()[0].metadata["lineage"][0]["source_id"], "source-1"
            )

    def test_limits_and_path_guard(self):
        with self.assertRaises(ValueError):
            self.s.create("x", [{"name": "x", "content": "a,a\n1,2"}])
        with self.assertRaises(ValueError):
            self.s.get_run("../escape")


if __name__ == "__main__":
    unittest.main()


class RecoveryTests(AssistedFixture, unittest.TestCase):
    def test_retry_uses_persisted_preview_without_graph(self):
        r = self.run_file()
        r = self.s.preview(r["id"], r["revision"])
        captured = []

        def broken(b, run, p):
            captured.append((b, p))
            raise Exception("interrupted")

        self.s.submitter = broken
        with self.assertRaises(RuntimeError):
            self.s.submit(r["id"], r["revision"], r["preview"]["hash"])
        self.assertEqual(self.s.get_run(r["id"])["status"], "submitting")
        with self.assertRaises(RuntimeError):
            self.s.update_mappings(r["id"], r["revision"], r["sources"])
        self.s.graph_reader = lambda ids: (_ for _ in ()).throw(Exception("offline"))
        self.s.submitter = lambda b, run, p: captured.append((b, p))
        self.s.submit(r["id"], r["revision"], r["preview"]["hash"])
        self.assertEqual(captured[0], captured[1])

    def test_model_does_not_block_reads_or_resurrect_delete(self):
        import threading, sys, types

        started = threading.Event()
        release = threading.Event()
        fake = types.ModuleType("llm_client")

        def call(messages):
            started.set()
            release.wait(3)
            return {"message": {"content": "{}"}}

        fake._call_llm = call
        fake._extract_json = __import__("json").loads
        r = self.s.create(
            "x",
            [{"name": "x", "content": "product_id,product_name\np1,Food\n"}],
            "auto",
        )
        with patch.dict(sys.modules, {"llm_client": fake}):

            def analyze():
                try:
                    self.s.analyze(r["id"])
                except KeyError:
                    pass

            t = threading.Thread(target=analyze)
            t.start()
            self.assertTrue(started.wait(2))
            self.assertEqual(self.s.get_run(r["id"])["status"], "analyzing")
            self.assertEqual(len(self.s.list_runs()), 1)
            self.s.delete(r["id"])
            release.set()
            t.join(3)
            self.assertFalse(t.is_alive())
        self.assertEqual(self.s.list_runs(), [])

    def test_graph_match_does_not_imply_applied(self):
        r = self.run_file()
        r = self.s.preview(r["id"], r["revision"])
        r = self.s.submit(r["id"], r["revision"], r["preview"]["hash"])
        self.graph["objects"] = [
            {"id": o["id"], "type": o["type"], "properties": o["properties"]}
            for o in r["preview"]["objects"]
        ]
        v = self.s.verify(r["id"])
        self.assertTrue(v["graph_matched"])
        self.assertIsNone(v["applied"])


class QueueConcurrencyTests(unittest.TestCase):
    def test_parallel_upserts_and_bundle_do_not_lose_records(self):
        import threading
        from review_queue import storage
        from review_queue.models import ReviewBatch

        with tempfile.TemporaryDirectory() as d, patch.object(
            storage, "_RUNTIME_DIR", Path(d)
        ), patch.object(storage, "_ITEMS_FILE", Path(d) / "items.json"), patch.object(
            storage, "_BATCHES_FILE", Path(d) / "batches.json"
        ):
            # Use real batch instances produced by the adapter.
            from data_pipeline.models import ImportPlan
            from review_queue.import_plan_adapter import (
                create_review_batch_from_import_plan,
            )

            batches = [ReviewBatch(id=str(i)) for i in range(30)]
            threads = [
                (
                    threading.Thread(target=storage.insert_bundle, args=(b, []))
                    if i % 2
                    else threading.Thread(target=storage.upsert_batch, args=(b,))
                )
                for i, b in enumerate(batches)
            ]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
            self.assertEqual(len(storage.load_batches()), 30)
            storage.save_batches([])
            self.assertEqual(storage.load_batches(), [])


class MappingBoundaryTests(AssistedFixture, unittest.TestCase):
    def test_unit_alias_requires_confirmation(self):
        r = self.run_file(
            "product_id,product_name,phosphorus_mg_per_100g\np1,Food,10\n"
        )
        src = r["sources"][0]
        src["object_mappings"][0]["field_mappings"].append(
            {
                "source_column": "phosphorus_mg_per_100g",
                "target_object_type": "PetFoodProduct",
                "target_property": "phosphorus_100g",
            }
        )
        # Resolve actual nutrient type from schema; use a canonical mapped property present in product.
        schema = self.s.schema_snapshot()["schema"]
        props = [
            p["name"] for p in schema["object_types"]["PetFoodProduct"]["properties"]
        ]
        target = next(x for x in props if x.endswith("_100g"))
        src["object_mappings"][0]["field_mappings"][-1]["target_property"] = target
        r = self.s.update_mappings(r["id"], r["revision"], [src])
        r = self.s.preview(r["id"], r["revision"])
        self.assertIn("UNIT_CONFIRMATION_REQUIRED", {x["code"] for x in r["issues"]})
        src = r["sources"][0]
        src["unit_confirmations"]["phosphorus_mg_per_100g"] = "per_100g"
        r = self.s.update_mappings(r["id"], r["revision"], [src])
        r = self.s.preview(r["id"], r["revision"])
        self.assertNotIn("UNIT_CONFIRMATION_REQUIRED", {x["code"] for x in r["issues"]})


class FinalRegressionTests(AssistedFixture, unittest.TestCase):
    def test_atomic_replace_failure_keeps_old_bytes(self):
        from review_queue import storage
        from review_queue.models import ReviewBatch

        with tempfile.TemporaryDirectory() as d, patch.object(
            storage, "_RUNTIME_DIR", Path(d)
        ), patch.object(storage, "_ITEMS_FILE", Path(d) / "items.json"), patch.object(
            storage, "_BATCHES_FILE", Path(d) / "batches.json"
        ):
            storage.save_batches([ReviewBatch(id="before")])
            before = storage._BATCHES_FILE.read_bytes()
            with patch.object(storage.os, "replace", side_effect=OSError("crash")):
                with self.assertRaises(OSError):
                    storage.save_batches([ReviewBatch(id="after")])
            self.assertEqual(storage._BATCHES_FILE.read_bytes(), before)
            self.assertEqual([x.id for x in storage.load_batches()], ["before"])

    def test_queue_reset_serializes_bundle_insertion(self):
        import threading
        from review_queue import storage
        from review_queue.models import ReviewBatch

        with tempfile.TemporaryDirectory() as d, patch.object(
            storage, "_RUNTIME_DIR", Path(d)
        ), patch.object(storage, "_ITEMS_FILE", Path(d) / "items.json"), patch.object(
            storage, "_BATCHES_FILE", Path(d) / "batches.json"
        ):
            entered = threading.Event()
            release = threading.Event()
            orig = storage.save_items

            def slow(items):
                orig(items)
                entered.set()
                release.wait(3)

            with patch.object(storage, "save_items", side_effect=slow):
                reset = threading.Thread(target=storage.clear_queue)
                reset.start()
                self.assertTrue(entered.wait(2))
                insert = threading.Thread(
                    target=storage.insert_bundle, args=(ReviewBatch(id="new"), [])
                )
                insert.start()
                release.set()
                reset.join(3)
                insert.join(3)
            self.assertEqual([x.id for x in storage.load_batches()], ["new"])

    def test_actual_reader_ignores_warning_status(self):
        from review_queue import storage
        from review_queue.models import ReviewItem, ReviewItemStatus, ReviewItemType

        r = self.run_file()
        r = self.s.preview(r["id"], r["revision"])
        with tempfile.TemporaryDirectory() as d, patch.object(
            storage, "_RUNTIME_DIR", Path(d)
        ), patch.object(storage, "_ITEMS_FILE", Path(d) / "items.json"), patch.object(
            storage, "_BATCHES_FILE", Path(d) / "batches.json"
        ):
            self.s.submitter = self.s._submit_review
            self.s.review_reader = self.s._read_review
            r = self.s.submit(r["id"], r["revision"], r["preview"]["hash"])
            items = storage.load_items()
            for item in items:
                item.status = ReviewItemStatus.APPLIED
            items.append(
                ReviewItem(
                    id="warning",
                    batch_id=r["review_batch_id"],
                    type=ReviewItemType.VALIDATION_WARNING,
                )
            )
            storage.save_items(items)
            self.assertTrue(self.s.verify(r["id"])["applied"])

    def test_contains_property_review_and_runtime_mismatch(self):
        from review_queue import storage

        r = self.s.create(
            "Import",
            [
                {
                    "name": "data",
                    "content": "product_id,product_name,ingredient_id,ingredient_name,ingredient_order\np1,Food,i1,Chicken,2\n",
                }
            ],
        )
        r = self.s.analyze(r["id"])
        src = r["sources"][0]
        link = next(x for x in src["link_mappings"] if x["link_type"] == "CONTAINS")
        link["field_mappings"] = [
            {
                "source_column": "ingredient_order",
                "target_object_type": "CONTAINS",
                "target_property": "ingredient_order",
            }
        ]
        r = self.s.update_mappings(r["id"], r["revision"], [src])
        r = self.s.preview(r["id"], r["revision"])
        self.assertEqual(r["preview"]["summary"]["errors"], 0)
        self.assertEqual(r["preview"]["links"][0]["properties"]["ingredient_order"], 2)
        with tempfile.TemporaryDirectory() as d, patch.object(
            storage, "_RUNTIME_DIR", Path(d)
        ), patch.object(storage, "_ITEMS_FILE", Path(d) / "items.json"), patch.object(
            storage, "_BATCHES_FILE", Path(d) / "batches.json"
        ):
            self.s.submitter = self.s._submit_review
            r = self.s.submit(r["id"], r["revision"], r["preview"]["hash"])
            item = next(x for x in storage.load_items() if x.candidate_link)
            self.assertEqual(item.candidate_link["properties"]["ingredient_order"], 2)
            self.assertTrue(item.metadata["lineage"])
        self.graph["objects"] = [
            {"id": o["id"], "type": o["type"], "properties": o["properties"]}
            for o in r["preview"]["objects"]
        ]
        self.graph["links"] = [
            {**r["preview"]["links"][0], "properties": {"ingredient_order": 1}}
        ]
        self.assertFalse(self.s.verify(r["id"])["graph_matched"])


class AutomaticLinkPropertyTests(AssistedFixture, unittest.TestCase):
    def test_analyze_infers_canonical_contains_order(self):
        r = self.s.create(
            "Import",
            [
                {
                    "name": "data",
                    "content": "product_id,product_name,ingredient_id,ingredient_name,ingredient_order\np1,Food,i1,Chicken,2\n",
                }
            ],
        )
        r = self.s.analyze(r["id"])
        r = self.s.preview(r["id"], r["revision"])
        self.assertEqual(r["preview"]["summary"]["errors"], 0)
        link = next(x for x in r["preview"]["links"] if x["type"] == "CONTAINS")
        self.assertEqual(link["properties"]["ingredient_order"], 2)


class DefaultReaderTests(AssistedFixture, unittest.TestCase):
    def test_default_adapter_and_reader_ignore_pending_warning(self):
        from review_queue import storage
        from review_queue.models import ReviewItem, ReviewItemType, ReviewItemStatus

        self.s = AssistedBuildService(
            ROOT, Path(self.tmp.name), graph_reader=lambda ids: self.graph
        )
        r = self.run_file()
        r = self.s.preview(r["id"], r["revision"])
        with tempfile.TemporaryDirectory() as d, patch.object(
            storage, "_RUNTIME_DIR", Path(d)
        ), patch.object(storage, "_ITEMS_FILE", Path(d) / "items.json"), patch.object(
            storage, "_BATCHES_FILE", Path(d) / "batches.json"
        ):
            r = self.s.submit(r["id"], r["revision"], r["preview"]["hash"])
            items = storage.load_items()
            for item in items:
                item.status = ReviewItemStatus.APPLIED
            items.append(
                ReviewItem(
                    id="info",
                    batch_id=r["review_batch_id"],
                    type=ReviewItemType.VALIDATION_WARNING,
                )
            )
            storage.save_items(items)
            result = self.s.verify(r["id"])
            self.assertTrue(result["applied"])
            self.assertEqual(result["review_other_item_statuses"], ["pending"])


class RestartAndLinkDiffTests(AssistedFixture, unittest.TestCase):
    def test_restart_retry_rejects_stale_analysis(self):
        import sys, types, threading

        started = threading.Event()
        release = threading.Event()
        fake = types.ModuleType("llm_client")

        def call(messages):
            started.set()
            release.wait(3)
            return {"message": {"content": "{}"}}

        fake._call_llm = call
        fake._extract_json = __import__("json").loads
        r = self.s.create(
            "Brands",
            [{"name": "x", "content": "brand_id,brand_name\nb1,Brand\n"}],
            "auto",
        )
        with patch.dict(sys.modules, {"llm_client": fake}):
            t = threading.Thread(target=self.s.analyze, args=(r["id"],))
            t.start()
            self.assertTrue(started.wait(2))
            other = AssistedBuildService(
                ROOT, Path(self.tmp.name), lambda ids: self.graph, self.s.submitter
            )
            self.assertEqual(other.recover_interrupted(), [r["id"]])
            interrupted = other.get_run(r["id"])
            self.assertEqual(interrupted["status"], "interrupted")
            queued = other.retry(r["id"], interrupted["revision"])
            self.assertEqual(queued["status"], "queued")
            release.set()
            t.join(3)
            self.assertFalse(t.is_alive())
            self.assertEqual(other.get_run(r["id"])["status"], "queued")
            fake._call_llm = lambda messages: {"message": {"content": "{}"}}
            done = other.analyze(r["id"])
            self.assertEqual(done["status"], "needs_confirmation")
            with self.assertRaises(RuntimeError):
                other.retry(r["id"], done["revision"])

    def test_existing_link_property_drift_invalidates_submission(self):
        r = self.s.create(
            "Import",
            [
                {
                    "name": "data",
                    "content": "product_id,product_name,ingredient_id,ingredient_name,ingredient_order\np1,Food,i1,Chicken,2\n",
                }
            ],
        )
        r = self.s.analyze(r["id"])
        self.graph["links"] = [
            {
                "source_id": "p1",
                "target_id": "i1",
                "type": "CONTAINS",
                "properties": {"ingredient_order": 1, "internal_metadata": "ignored"},
            }
        ]
        r = self.s.preview(r["id"], r["revision"])
        link = r["preview"]["links"][0]
        self.assertTrue(link["existing"])
        self.assertEqual(
            link["property_diffs"]["ingredient_order"], {"before": 1, "after": 2}
        )
        self.assertNotIn("internal_metadata", link["existing_properties"])
        self.graph["links"][0]["properties"]["ingredient_order"] = 3
        with self.assertRaises(RuntimeError):
            self.s.submit(r["id"], r["revision"], r["preview"]["hash"])

"""Regression tests for applying reviewed Assisted Build candidates."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

from neo4j.exceptions import IncompleteCommit, ServiceUnavailable

from review_queue import service, storage
from review_queue.graph_writer import apply_review_item_to_graph
from review_queue.models import ReviewApplyResult, ReviewBatch, ReviewItem, ReviewItemType


def assisted_object(*, exists=True):
    return ReviewItem(
        id="review-object", batch_id="review-batch", status="approved",
        candidate_object={"id": "P1", "type": "PetFoodProduct", "properties": {"product_name": "After"}},
        metadata={"assisted_build_run_id": "ab-example", "apply_precondition": {
            "exists": exists, "properties": {"product_name": "Before"} if exists else {},
        }},
    )


def assisted_link():
    return ReviewItem(
        id="review-link", batch_id="review-batch", status="approved",
        type=ReviewItemType.IMPORT_LINK_CANDIDATE,
        candidate_link={
            "source_id": "P1", "target_id": "I1", "type": "CONTAINS",
            "properties": {"ingredient_order": 2},
        },
        metadata={"assisted_build_run_id": "ab-example", "apply_precondition": {
            "exists": True, "properties": {"ingredient_order": 1},
            "source_type": "PetFoodProduct", "target_type": "Ingredient",
        }},
    )


def neo_record(element_id, properties, labels=None):
    return {"element_id": element_id, "properties": properties, "labels": labels or []}


class ReviewWriterTests(unittest.TestCase):
    def setUp(self):
        self.driver = MagicMock()
        self.session = self.driver.session.return_value.__enter__.return_value
        self.tx = Mock()
        self.session.execute_write.side_effect = lambda callback: callback(self.tx)

    def records(self, *record_sets):
        self.tx.run.side_effect = [Mock(**{"data.return_value": records}) for records in record_sets]

    def test_existing_object_changed_since_preview_returns_conflict(self):
        self.records([neo_record("p1", {"id": "P1", "product_name": "Later"}, ["PetFoodProduct"])])
        result = apply_review_item_to_graph(assisted_object(), self.driver)
        self.assertEqual(result.status, "conflict")
        self.assertFalse(result.applied)
        self.assertEqual(self.tx.run.call_count, 1)
        self.assertIn("product_name", result.error)

    def test_boolean_and_number_have_distinct_preview_values(self):
        for current, expected in ((1, True), ([1], [True])):
            with self.subTest(current=current, expected=expected):
                self.records([neo_record("p1", {"id": "P1", "product_name": current}, ["PetFoodProduct"])],
                             [{"element_id": "p1"}])
                item = assisted_object()
                item.metadata["apply_precondition"]["properties"]["product_name"] = expected
                result = apply_review_item_to_graph(item, self.driver)
                self.assertEqual(result.status, "conflict")

    def test_replaced_object_has_conflict_even_if_relevant_values_match(self):
        self.records([neo_record("replacement", {"id": "P1", "product_name": "Before"}, ["PetFoodProduct"])])
        item = assisted_object()
        item.metadata["apply_precondition"]["element_id"] = "original"
        result = apply_review_item_to_graph(item, self.driver)
        self.assertEqual(result.status, "conflict")
        self.assertIn("replaced", result.error)

    def test_new_object_that_appeared_since_preview_is_not_overwritten(self):
        self.records([neo_record("p1", {"id": "P1", "product_name": "After"}, ["PetFoodProduct"])])
        result = apply_review_item_to_graph(assisted_object(exists=False), self.driver)
        self.assertEqual(result.status, "conflict")
        self.assertEqual(self.tx.run.call_count, 1)

    def test_matching_object_is_updated_after_the_lock(self):
        self.records(
            [neo_record("p1", {"id": "P1", "product_name": "Before"}, ["PetFoodProduct"])],
            [{"element_id": "p1"}],
        )
        result = apply_review_item_to_graph(assisted_object(), self.driver)
        self.assertTrue(result.applied, result.error)
        self.assertEqual(self.tx.run.call_count, 2)
        first_query = self.tx.run.call_args_list[0].args[0]
        self.assertIn("SET n._review_write_lock", first_query)
        self.assertLess(first_query.index("SET"), first_query.index("properties(n)"))
        self.assertEqual(self.tx.run.call_args.kwargs["props"]["product_name"], "After")

    def test_replaying_a_committed_review_recovers_without_writing_again(self):
        self.records([neo_record("p1", {
            "id": "P1", "product_name": "After", "_review_item_id": "review-object",
        }, ["PetFoodProduct"])])
        result = apply_review_item_to_graph(assisted_object(exists=False), self.driver)
        self.assertTrue(result.applied, result.error)
        self.assertEqual(self.tx.run.call_count, 1)

    def test_replay_cannot_restore_values_changed_after_its_original_commit(self):
        self.records([neo_record("p1", {
            "id": "P1", "product_name": "Before", "_review_item_id": "review-object",
        }, ["PetFoodProduct"])], [{"element_id": "p1"}])
        result = apply_review_item_to_graph(assisted_object(), self.driver)
        self.assertEqual(result.status, "conflict")
        self.assertEqual(self.tx.run.call_count, 1)

    def test_new_object_is_created_using_the_schema_primary_key(self):
        self.records([], [{"properties": {
            "id": "P1", "product_name": "After", "_review_item_id": "review-object",
        }}])
        result = apply_review_item_to_graph(assisted_object(exists=False), self.driver)
        self.assertTrue(result.applied, result.error)
        create_query = self.tx.run.call_args.args[0]
        self.assertIn("{`product_id`: $node_id}", create_query)
        self.assertIn("ON CREATE SET", create_query)
        self.assertEqual(self.tx.run.call_args.kwargs["props"]["id"], "P1")

    def test_object_created_by_another_writer_during_insert_is_a_conflict(self):
        self.records([], [{"properties": {"id": "P1", "product_name": "Concurrent"}}])
        result = apply_review_item_to_graph(assisted_object(exists=False), self.driver)
        self.assertEqual(result.status, "conflict")
        self.assertNotIn("ON MATCH SET", self.tx.run.call_args.args[0])

    def test_link_property_changed_since_preview_returns_conflict(self):
        self.records(
            [neo_record("p1", {"id": "P1"}, ["PetFoodProduct"]), neo_record("i1", {"id": "I1"}, ["Ingredient"])],
            [neo_record("r1", {"ingredient_order": 3})],
        )
        result = apply_review_item_to_graph(assisted_link(), self.driver)
        self.assertEqual(result.status, "conflict")
        self.assertEqual(self.tx.run.call_count, 2)

    def test_link_endpoint_type_changed_since_preview_returns_conflict(self):
        self.records([neo_record("p1", {"id": "P1"}, ["Brand"]), neo_record("i1", {"id": "I1"}, ["Ingredient"])])
        result = apply_review_item_to_graph(assisted_link(), self.driver)
        self.assertEqual(result.status, "conflict")
        self.assertEqual(self.tx.run.call_count, 1)
        self.assertIn("P1", result.error)

    def test_unverified_historical_assisted_item_requires_a_fresh_preview(self):
        item = assisted_object()
        del item.metadata["apply_precondition"]
        result = apply_review_item_to_graph(item, self.driver)
        self.assertEqual(result.status, "conflict")
        self.assertIn("fresh preview", result.error)
        self.driver.session.assert_not_called()

    def test_transient_driver_error_is_retryable(self):
        for exception in (ServiceUnavailable, IncompleteCommit):
            with self.subTest(exception=exception):
                self.session.execute_write.side_effect = exception("connection interrupted")
                result = apply_review_item_to_graph(assisted_object(), self.driver)
                self.assertEqual(result.status, "retryable")
                self.assertFalse(result.applied)


class ReviewServiceTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        runtime = Path(directory)
        self.enterContext(patch.multiple(storage, _RUNTIME_DIR=runtime,
                                        _ITEMS_FILE=runtime / "items.json", _BATCHES_FILE=runtime / "batches.json"))
        storage.insert_bundle(ReviewBatch(id="review-batch"), [assisted_link(), assisted_object()])

    def test_retryable_error_keeps_approval_and_success_clears_error(self):
        with patch.object(service, "apply_review_item_to_graph", side_effect=[
            ReviewApplyResult(item_id="review-object", status="retryable", error="Graph unavailable"),
            ReviewApplyResult(item_id="review-object", status="applied", applied=True),
        ]):
            service.apply_review_item("review-object")
            self.assertEqual(storage.get_item("review-object").status.value, "approved")
            self.assertEqual(storage.get_item("review-object").apply_error, "Graph unavailable")
            service.apply_review_item("review-object")
        self.assertEqual(storage.get_item("review-object").status.value, "applied")
        self.assertEqual(storage.get_item("review-object").apply_error, "")

    def test_batch_orders_objects_before_links_and_reports_partial_apply(self):
        def write(item):
            if item.id == "review-link":
                return ReviewApplyResult(item_id=item.id, status="conflict", error="Review conflict")
            return ReviewApplyResult(item_id=item.id, status="applied", applied=True)

        with patch.object(service, "apply_review_item_to_graph", side_effect=write), \
             patch("graph_snapshot.create_snapshot", side_effect=RuntimeError("Snapshot unavailable")), \
             patch("ontology.refresh_graph"):
            batch = service.apply_approved_batch("review-batch")
        self.assertEqual([r.item_id for r in batch["results"]], ["review-object", "review-link"])
        self.assertEqual([r.status for r in batch["results"]], ["applied", "conflict"])
        self.assertEqual(storage.get_batch("review-batch").status.value, "partially_applied")
        self.assertEqual(storage.get_item("review-link").apply_error, "Review conflict")
        self.assertEqual(storage.get_item("review-link").metadata["apply_status"], "conflict")

    def test_batch_keeps_link_approved_when_new_endpoint_can_be_retried(self):
        item = assisted_object(exists=False)
        storage.upsert_item(item)
        link = assisted_link()
        link.metadata["apply_precondition"].update(exists=False, properties={})
        storage.upsert_item(link)

        def write(item):
            if item.id == "review-link":
                self.fail("Link writer ran while a reviewed new endpoint was still waiting")
            return ReviewApplyResult(item_id=item.id, status="retryable", error="Graph unavailable")

        with patch.object(service, "apply_review_item_to_graph", side_effect=write), \
             patch("graph_snapshot.create_snapshot", side_effect=RuntimeError("Snapshot unavailable")), \
             patch("ontology.refresh_graph"):
            batch = service.apply_approved_batch("review-batch")
        self.assertEqual([result.status for result in batch["results"]], ["retryable", "retryable"])
        self.assertEqual(storage.get_item("review-link").status.value, "approved")
        self.assertIn("P1", storage.get_item("review-link").apply_error)

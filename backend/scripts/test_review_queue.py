"""Tests for Review Queue — Phase 29."""

import json
import os
import sys
import shutil
import tempfile
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from review_queue.models import (
    ReviewApplyResult,
    ReviewBatch,
    ReviewBatchAndItems,
    ReviewBatchStatus,
    ReviewDecision,
    ReviewItem,
    ReviewItemStatus,
    ReviewItemType,
    ReviewQueueSummary,
    ReviewSeverity,
    ReviewSource,
)
from data_pipeline.models import (
    CandidateObject,
    CandidateLink,
    ImportPlan,
    ImportPlanSummary,
    DataSourceProfile,
    PlanStatus,
)
import review_queue.storage as storage


# ── Helpers ────────────────────────────────────────────────────────────

def _make_plan(
    objects=None, links=None, issues=None,
    plan_id="test-plan-1", status=PlanStatus.DRAFT,
):
    return ImportPlan(
        plan_id=plan_id,
        domain="pet_food",
        source_profile=DataSourceProfile(source_id="test-source", source_name="test"),
        candidate_objects=objects or [],
        candidate_links=links or [],
        validation_issues=issues or [],
        summary=ImportPlanSummary(new_objects=len(objects or []), new_links=len(links or [])),
        status=status,
    )


def _make_candidate_object(idx=1):
    return CandidateObject(
        id=f"OBJ{idx:03d}",
        type="Ingredient",
        properties={"name": f"Ingredient {idx}", "type": "protein"},
        confidence=0.9,
        evidence="test evidence",
    )


def _make_candidate_link(src="OBJ001", tgt="OBJ002"):
    return CandidateLink(
        source_id=src,
        target_id=tgt,
        type="CONTAINS",
        confidence=0.85,
    )


# ── Test storage isolation ─────────────────────────────────────────────

_test_runtime_dir = None


def _setup_test_storage():
    """Redirect storage to a temp dir so tests don't touch real .runtime/."""
    global _test_runtime_dir
    _test_runtime_dir = tempfile.mkdtemp(prefix="review_test_")

    import review_queue.storage as storage
    storage._RUNTIME_DIR = Path(_test_runtime_dir)
    storage._ITEMS_FILE = storage._RUNTIME_DIR / "review_items.json"
    storage._BATCHES_FILE = storage._RUNTIME_DIR / "review_batches.json"


def _teardown_test_storage():
    global _test_runtime_dir
    if _test_runtime_dir and os.path.exists(_test_runtime_dir):
        shutil.rmtree(_test_runtime_dir)


# ── Tests ──────────────────────────────────────────────────────────────

def test_01_import_plan_adapter_valid():
    """Adapter converts a valid ImportPlan to ReviewBatch + Items."""
    from review_queue.import_plan_adapter import create_review_batch_from_import_plan

    plan = _make_plan(
        objects=[_make_candidate_object(1), _make_candidate_object(2)],
        links=[_make_candidate_link()],
    )
    result = create_review_batch_from_import_plan(plan)

    assert isinstance(result, ReviewBatchAndItems)
    assert result.batch.item_count == 3
    assert result.batch.pending_count == 3
    assert len(result.items) == 3

    obj_items = [i for i in result.items if i.type == ReviewItemType.IMPORT_OBJECT_CANDIDATE]
    link_items = [i for i in result.items if i.type == ReviewItemType.IMPORT_LINK_CANDIDATE]
    assert len(obj_items) == 2
    assert len(link_items) == 1
    print("  ✓ test_01_import_plan_adapter_valid")


def test_02_adapter_rejects_critical_issues():
    """Adapter rejects plan with critical/error validation issues."""
    from review_queue.import_plan_adapter import create_review_batch_from_import_plan

    plan = _make_plan(
        objects=[_make_candidate_object()],
        issues=[{"level": "critical", "code": "ERR", "message": "bad"}],
    )
    try:
        create_review_batch_from_import_plan(plan)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "critical" in str(e).lower()
        print("  ✓ test_02_adapter_rejects_critical_issues")


def test_03_adapter_rejects_empty_plan():
    """Adapter rejects plan with no candidates."""
    from review_queue.import_plan_adapter import create_review_batch_from_import_plan

    plan = _make_plan(objects=[], links=[])
    try:
        create_review_batch_from_import_plan(plan)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "no candidate" in str(e).lower()
        print("  ✓ test_03_adapter_rejects_empty_plan")


def test_04_adapter_creates_warning_items():
    """Adapter creates review items for warning-level validation issues."""
    from review_queue.import_plan_adapter import create_review_batch_from_import_plan

    plan = _make_plan(
        objects=[_make_candidate_object()],
        issues=[
            {"level": "warning", "code": "WARN_1", "message": "watch out"},
            {"level": "info", "code": "INFO_1", "message": "fyi"},
        ],
    )
    result = create_review_batch_from_import_plan(plan)
    warning_items = [i for i in result.items if i.type == ReviewItemType.VALIDATION_WARNING]
    assert len(warning_items) == 2
    print("  ✓ test_04_adapter_creates_warning_items")


def test_05_persistence_roundtrip():
    """Items and batches persist to JSON and survive reload."""
    from review_queue import storage

    item = ReviewItem(
        id="persist-test-1",
        batch_id="batch-1",
        type=ReviewItemType.IMPORT_OBJECT_CANDIDATE,
        title="Test item",
        status=ReviewItemStatus.PENDING,
    )
    batch = ReviewBatch(
        id="batch-1",
        source_type=ReviewSource.IMPORT_PLAN,
        title="Test batch",
        item_count=1,
        pending_count=1,
    )

    storage.upsert_item(item)
    storage.upsert_batch(batch)

    # Reload from disk
    loaded_items = storage.load_items()
    loaded_batches = storage.load_batches()

    assert len(loaded_items) >= 1
    assert any(i.id == "persist-test-1" for i in loaded_items)
    assert len(loaded_batches) >= 1
    assert any(b.id == "batch-1" for b in loaded_batches)
    print("  ✓ test_05_persistence_roundtrip")


def test_06_approve_pending_item():
    """Approve a pending item changes status."""
    _setup_test_storage()

    from review_queue import service
    service.set_pipeline_service(None)  # Not needed for direct item tests

    item = ReviewItem(
        id="approve-test-1",
        batch_id="batch-a",
        type=ReviewItemType.IMPORT_OBJECT_CANDIDATE,
        title="Approve me",
        status=ReviewItemStatus.PENDING,
    )
    storage.upsert_item(item)
    storage.upsert_batch(ReviewBatch(id="batch-a", item_count=1, pending_count=1))

    decision = ReviewDecision(decision="approve", reason="looks good", reviewed_by="tester")
    result = service.approve_review_item("approve-test-1", decision)

    assert result.status == ReviewItemStatus.APPROVED
    assert result.reviewed_by == "tester"
    assert result.decision_reason == "looks good"
    print("  ✓ test_06_approve_pending_item")


def test_07_reject_pending_item():
    """Reject a pending item changes status."""
    _setup_test_storage()

    item = ReviewItem(
        id="reject-test-1",
        batch_id="batch-r",
        type=ReviewItemType.IMPORT_OBJECT_CANDIDATE,
        title="Reject me",
        status=ReviewItemStatus.PENDING,
    )
    storage.upsert_item(item)
    storage.upsert_batch(ReviewBatch(id="batch-r", item_count=1, pending_count=1))

    from review_queue import service
    decision = ReviewDecision(decision="reject", reason="bad data", reviewed_by="tester")
    result = service.reject_review_item("reject-test-1", decision)

    assert result.status == ReviewItemStatus.REJECTED
    assert result.decision_reason == "bad data"
    print("  ✓ test_07_reject_pending_item")


def test_08_cannot_apply_pending():
    """Cannot apply a pending item."""
    _setup_test_storage()

    item = ReviewItem(
        id="apply-pending-1",
        batch_id="batch-ap",
        type=ReviewItemType.IMPORT_OBJECT_CANDIDATE,
        title="Not approved yet",
        status=ReviewItemStatus.PENDING,
    )
    storage.upsert_item(item)

    from review_queue import service
    try:
        service.apply_review_item("apply-pending-1")
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "pending" in str(e).lower()
        print("  ✓ test_08_cannot_apply_pending")


def test_09_cannot_apply_rejected():
    """Cannot apply a rejected item."""
    _setup_test_storage()

    item = ReviewItem(
        id="apply-rejected-1",
        batch_id="batch-ar",
        type=ReviewItemType.IMPORT_OBJECT_CANDIDATE,
        title="Rejected",
        status=ReviewItemStatus.REJECTED,
    )
    storage.upsert_item(item)

    from review_queue import service
    try:
        service.apply_review_item("apply-rejected-1")
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "rejected" in str(e).lower()
        print("  ✓ test_09_cannot_apply_rejected")


def test_10_cannot_approve_applied():
    """Cannot approve an already applied item."""
    _setup_test_storage()

    item = ReviewItem(
        id="already-applied-1",
        batch_id="batch-al",
        type=ReviewItemType.IMPORT_OBJECT_CANDIDATE,
        title="Already applied",
        status=ReviewItemStatus.APPLIED,
    )
    storage.upsert_item(item)

    from review_queue import service
    decision = ReviewDecision(decision="approve", reason="", reviewed_by="tester")
    try:
        service.approve_review_item("already-applied-1", decision)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "applied" in str(e).lower()
        print("  ✓ test_10_cannot_approve_applied")


def test_11_batch_counters_update():
    """Batch counters update after approve/reject."""
    _setup_test_storage()

    batch = ReviewBatch(id="batch-counters", item_count=3, pending_count=3)
    storage.upsert_batch(batch)

    for i in range(3):
        storage.upsert_item(ReviewItem(
            id=f"counter-item-{i}",
            batch_id="batch-counters",
            type=ReviewItemType.IMPORT_OBJECT_CANDIDATE,
            title=f"Item {i}",
            status=ReviewItemStatus.PENDING,
        ))

    from review_queue import service
    service.approve_review_item("counter-item-0", ReviewDecision(decision="approve"))
    service.reject_review_item("counter-item-1", ReviewDecision(decision="reject"))

    updated = storage.get_batch("batch-counters")
    assert updated.approved_count == 1
    assert updated.rejected_count == 1
    assert updated.pending_count == 1
    assert updated.status == ReviewBatchStatus.PARTIALLY_REVIEWED
    print("  ✓ test_11_batch_counters_update")


def test_12_summary_logic():
    """Summary endpoint returns correct counts."""
    _setup_test_storage()

    for i, status in enumerate([
        ReviewItemStatus.PENDING,
        ReviewItemStatus.APPROVED,
        ReviewItemStatus.APPLIED,
        ReviewItemStatus.REJECTED,
    ]):
        storage.upsert_item(ReviewItem(
            id=f"summary-{i}",
            batch_id="batch-s",
            type=ReviewItemType.IMPORT_OBJECT_CANDIDATE,
            severity=ReviewSeverity.MEDIUM,
            source=ReviewSource.IMPORT_PLAN,
            title=f"Item {i}",
            status=status,
        ))

    from review_queue import service
    summary = service.get_review_summary()

    assert summary.total == 4
    assert summary.pending == 1
    assert summary.approved == 1
    assert summary.applied == 1
    assert summary.rejected == 1
    print("  ✓ test_12_summary_logic")


def test_13_unsupported_item_apply():
    """Unsupported review item type returns failed status (not applied)."""
    from review_queue.graph_writer import apply_review_item_to_graph

    item = ReviewItem(
        id="unsupported-1",
        type=ReviewItemType.VALIDATION_WARNING,
        title="Warning only",
        status=ReviewItemStatus.APPROVED,
    )
    result = apply_review_item_to_graph(item)
    assert result.applied is False
    assert result.status == "failed"
    assert "not graph-applicable" in result.error.lower()
    print("  ✓ test_13_unsupported_item_apply")


def test_14_filter_items():
    """list_review_items supports filters."""
    _setup_test_storage()

    storage.upsert_item(ReviewItem(
        id="filter-a", batch_id="b1", type=ReviewItemType.IMPORT_OBJECT_CANDIDATE,
        source=ReviewSource.IMPORT_PLAN, status=ReviewItemStatus.PENDING, title="A",
    ))
    storage.upsert_item(ReviewItem(
        id="filter-b", batch_id="b1", type=ReviewItemType.IMPORT_LINK_CANDIDATE,
        source=ReviewSource.IMPORT_PLAN, status=ReviewItemStatus.APPROVED, title="B",
    ))

    from review_queue import service

    pending = service.list_review_items(status="pending")
    assert all(i.status == ReviewItemStatus.PENDING for i in pending)

    by_type = service.list_review_items(type="IMPORT_LINK_CANDIDATE")
    assert all(i.type == ReviewItemType.IMPORT_LINK_CANDIDATE for i in by_type)

    by_batch = service.list_review_items(batch_id="b1")
    assert len(by_batch) == 2
    print("  ✓ test_14_filter_items")


def test_15_service_reload_persistence():
    """Review state survives simulated service reload."""
    _setup_test_storage()

    # Write items
    storage.upsert_item(ReviewItem(
        id="reload-1", batch_id="b-reload",
        type=ReviewItemType.IMPORT_OBJECT_CANDIDATE,
        status=ReviewItemStatus.APPROVED,
        title="Survives reload",
    ))

    # Simulate reload by reading from disk
    loaded = storage.load_items()
    found = [i for i in loaded if i.id == "reload-1"]
    assert len(found) == 1
    assert found[0].status == ReviewItemStatus.APPROVED
    print("  ✓ test_15_service_reload_persistence")


# ── Run all ────────────────────────────────────────────────────────────

def main():
    print("\n🧪 Review Queue Tests")
    print("=" * 50)

    _setup_test_storage()

    tests = [
        test_01_import_plan_adapter_valid,
        test_02_adapter_rejects_critical_issues,
        test_03_adapter_rejects_empty_plan,
        test_04_adapter_creates_warning_items,
        test_05_persistence_roundtrip,
        test_06_approve_pending_item,
        test_07_reject_pending_item,
        test_08_cannot_apply_pending,
        test_09_cannot_apply_rejected,
        test_10_cannot_approve_applied,
        test_11_batch_counters_update,
        test_12_summary_logic,
        test_13_unsupported_item_apply,
        test_14_filter_items,
        test_15_service_reload_persistence,
    ]

    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            print(f"  ✗ {test.__name__}: {e}")
            failed += 1

    _teardown_test_storage()

    print(f"\n{'=' * 50}")
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    if failed == 0:
        print("✅ All review queue tests passed!")
    else:
        print("❌ Some tests failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()

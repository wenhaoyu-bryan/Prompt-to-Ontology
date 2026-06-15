"""Review Queue service — business logic for HITL workflow."""

from __future__ import annotations

import logging
from datetime import datetime

logger = logging.getLogger(__name__)

from .graph_writer import apply_review_item_to_graph
from .import_plan_adapter import create_review_batch_from_import_plan
from .models import (
    ReviewApplyResult,
    ReviewBatch,
    ReviewBatchStatus,
    ReviewDecision,
    ReviewItem,
    ReviewItemStatus,
    ReviewQueueSummary,
)
from .storage import (
    get_batch,
    get_item,
    load_batches,
    load_items,
    save_batches,
    save_items,
    upsert_batch,
    upsert_item,
)

# Reference to pipeline service — set by main.py at startup
_pipeline_service = None


def set_pipeline_service(service):
    global _pipeline_service
    _pipeline_service = service


def submit_import_plan_to_review(plan_id: str) -> ReviewBatch:
    """Submit an ImportPlan to the review queue. Returns the created batch."""
    if _pipeline_service is None:
        raise RuntimeError("Pipeline service not configured")

    plan = _pipeline_service.get_import_plan(plan_id)
    if plan is None:
        raise ValueError(f"Import plan '{plan_id}' not found")

    result = create_review_batch_from_import_plan(plan)

    # Persist batch and items
    upsert_batch(result.batch)
    all_items = load_items()
    all_items.extend(result.items)
    save_items(all_items)

    return result.batch


def list_review_items(
    status: str | None = None,
    source: str | None = None,
    batch_id: str | None = None,
    type: str | None = None,
) -> list[ReviewItem]:
    """List review items with optional filters."""
    items = load_items()
    if status:
        items = [i for i in items if i.status.value == status]
    if source:
        items = [i for i in items if i.source.value == source]
    if batch_id:
        items = [i for i in items if i.batch_id == batch_id]
    if type:
        items = [i for i in items if i.type.value == type]
    return items


def get_review_item(item_id: str) -> ReviewItem | None:
    return get_item(item_id)


def approve_review_item(item_id: str, decision: ReviewDecision) -> ReviewItem:
    """Approve a pending review item."""
    item = get_item(item_id)
    if item is None:
        raise ValueError(f"Review item '{item_id}' not found")
    if item.status != ReviewItemStatus.PENDING:
        raise ValueError(f"Cannot approve item with status '{item.status.value}'")

    now = datetime.utcnow()
    item.status = ReviewItemStatus.APPROVED
    item.reviewed_at = now
    item.reviewed_by = decision.reviewed_by
    item.decision_reason = decision.reason
    item.updated_at = now

    upsert_item(item)
    _refresh_batch_counters(item.batch_id)
    return item


def reject_review_item(item_id: str, decision: ReviewDecision) -> ReviewItem:
    """Reject a pending review item."""
    item = get_item(item_id)
    if item is None:
        raise ValueError(f"Review item '{item_id}' not found")
    if item.status != ReviewItemStatus.PENDING:
        raise ValueError(f"Cannot reject item with status '{item.status.value}'")

    now = datetime.utcnow()
    item.status = ReviewItemStatus.REJECTED
    item.reviewed_at = now
    item.reviewed_by = decision.reviewed_by
    item.decision_reason = decision.reason
    item.updated_at = now

    upsert_item(item)
    _refresh_batch_counters(item.batch_id)
    return item


def apply_review_item(item_id: str) -> ReviewApplyResult:
    """Apply an approved review item to the graph."""
    item = get_item(item_id)
    if item is None:
        raise ValueError(f"Review item '{item_id}' not found")
    if item.status == ReviewItemStatus.PENDING:
        raise ValueError("Cannot apply a pending item. Approve it first.")
    if item.status == ReviewItemStatus.REJECTED:
        raise ValueError("Cannot apply a rejected item.")
    if item.status == ReviewItemStatus.APPLIED:
        raise ValueError("Item already applied.")
    if item.status != ReviewItemStatus.APPROVED:
        raise ValueError(f"Cannot apply item with status '{item.status.value}'")

    result = apply_review_item_to_graph(item)

    now = datetime.utcnow()
    if result.applied:
        item.status = ReviewItemStatus.APPLIED
        item.applied_at = now
        item.updated_at = now
    else:
        item.status = ReviewItemStatus.FAILED
        item.apply_error = result.error
        item.updated_at = now

    upsert_item(item)
    _refresh_batch_counters(item.batch_id)
    return result


def apply_approved_batch(batch_id: str) -> dict:
    """Apply all approved items in a batch. Objects are applied before links.

    Returns a dict with 'results' (list of ReviewApplyResult) and snapshot/diff IDs.
    """
    batch = get_batch(batch_id)
    if batch is None:
        raise ValueError(f"Review batch '{batch_id}' not found")

    items = [i for i in load_items() if i.batch_id == batch_id and i.status == ReviewItemStatus.APPROVED]

    # Sort: objects first, then links, then others. Within each group, respect stage_order.
    _TYPE_ORDER = {
        "import_object_candidate": 0,
        "import_link_candidate": 1,
    }
    items.sort(key=lambda i: (
        _TYPE_ORDER.get(i.type.value if hasattr(i.type, 'value') else i.type, 2),
        (i.metadata or {}).get("_stage_order", 99),
    ))

    # Create before snapshot
    before_snapshot_id = None
    after_snapshot_id = None
    diff_id = None
    try:
        from graph_snapshot import create_snapshot, compare_snapshots
        before_snap = create_snapshot(
            reason="before_batch_apply",
            title=f"Before applying batch {batch_id}",
            metadata={"review_batch_id": batch_id},
        )
        before_snapshot_id = before_snap.snapshot_id
    except Exception as e:
        logger.warning("Failed to create before-snapshot for batch %s: %s", batch_id, e)

    results = []
    for item in items:
        result = apply_review_item(item.id)
        results.append(result)

    # Refresh in-memory graph after batch apply
    try:
        from ontology import refresh_graph
        refresh_graph()
    except Exception as e:
        logger.warning("Failed to refresh graph after batch apply: %s", e)

    # Create after snapshot and diff
    try:
        from graph_snapshot import create_snapshot, compare_snapshots
        from graph_snapshot.storage import update_diff
        after_snap = create_snapshot(
            reason="after_batch_apply",
            title=f"After applying batch {batch_id}",
            metadata={"review_batch_id": batch_id},
        )
        after_snapshot_id = after_snap.snapshot_id
        if before_snapshot_id:
            diff = compare_snapshots(before_snapshot_id, after_snapshot_id)
            diff.metadata["review_batch_id"] = batch_id
            diff.metadata["operation"] = "batch_apply"
            update_diff(diff)
            diff_id = diff.diff_id
    except Exception as e:
        logger.warning("Failed to create after-snapshot/diff for batch %s: %s", batch_id, e)

    return {
        "results": results,
        "before_snapshot_id": before_snapshot_id,
        "after_snapshot_id": after_snapshot_id,
        "diff_id": diff_id,
    }


def get_review_summary() -> ReviewQueueSummary:
    """Get review queue summary statistics."""
    items = load_items()
    summary = ReviewQueueSummary(total=len(items))

    by_type: dict[str, int] = {}
    by_source: dict[str, int] = {}
    by_severity: dict[str, int] = {}

    for item in items:
        # Status counts
        if item.status == ReviewItemStatus.PENDING:
            summary.pending += 1
        elif item.status == ReviewItemStatus.APPROVED:
            summary.approved += 1
        elif item.status == ReviewItemStatus.REJECTED:
            summary.rejected += 1
        elif item.status == ReviewItemStatus.APPLIED:
            summary.applied += 1
        elif item.status == ReviewItemStatus.FAILED:
            summary.failed += 1

        # Group counts
        t = item.type.value
        by_type[t] = by_type.get(t, 0) + 1

        s = item.source.value
        by_source[s] = by_source.get(s, 0) + 1

        sv = item.severity.value
        by_severity[sv] = by_severity.get(sv, 0) + 1

    summary.by_type = by_type
    summary.by_source = by_source
    summary.by_severity = by_severity
    return summary


def list_review_batches() -> list[ReviewBatch]:
    return load_batches()


def get_review_batch(batch_id: str) -> ReviewBatch | None:
    return get_batch(batch_id)


# ── Internal helpers ───────────────────────────────────────────────────

def _refresh_batch_counters(batch_id: str) -> None:
    """Recompute batch status/counters from its items."""
    batch = get_batch(batch_id)
    if batch is None:
        return

    items = [i for i in load_items() if i.batch_id == batch_id]
    batch.item_count = len(items)
    batch.pending_count = sum(1 for i in items if i.status == ReviewItemStatus.PENDING)
    batch.approved_count = sum(1 for i in items if i.status == ReviewItemStatus.APPROVED)
    batch.rejected_count = sum(1 for i in items if i.status == ReviewItemStatus.REJECTED)
    batch.applied_count = sum(1 for i in items if i.status == ReviewItemStatus.APPLIED)
    batch.failed_count = sum(1 for i in items if i.status == ReviewItemStatus.FAILED)
    batch.updated_at = datetime.utcnow()

    # Derive batch status
    if batch.applied_count == batch.item_count:
        batch.status = ReviewBatchStatus.APPLIED
    elif batch.failed_count > 0 and batch.applied_count > 0:
        batch.status = ReviewBatchStatus.PARTIALLY_APPLIED
    elif batch.failed_count == batch.item_count:
        batch.status = ReviewBatchStatus.FAILED
    elif batch.rejected_count == batch.item_count:
        batch.status = ReviewBatchStatus.REJECTED
    elif batch.approved_count == batch.item_count:
        batch.status = ReviewBatchStatus.APPROVED
    elif batch.approved_count > 0 or batch.rejected_count > 0:
        batch.status = ReviewBatchStatus.PARTIALLY_REVIEWED
    else:
        batch.status = ReviewBatchStatus.PENDING

    upsert_batch(batch)

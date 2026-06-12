"""Convert a Data Pipeline ImportPlan into ReviewBatch + ReviewItems."""

from __future__ import annotations

import uuid
from datetime import datetime

from data_pipeline.models import ImportPlan, PlanStatus

from .models import (
    ReviewBatch,
    ReviewBatchAndItems,
    ReviewBatchStatus,
    ReviewItem,
    ReviewItemStatus,
    ReviewItemType,
    ReviewSeverity,
    ReviewSource,
)


def create_review_batch_from_import_plan(import_plan: ImportPlan) -> ReviewBatchAndItems:
    """Convert an ImportPlan into a ReviewBatch and ReviewItems.

    Raises ValueError if the plan cannot be submitted (errors, empty).
    """
    # ── Guards ─────────────────────────────────────────────────────────
    has_critical = any(
        iss.get("level") in ("critical", "error")
        for iss in import_plan.validation_issues
    )
    if has_critical:
        raise ValueError(
            "Import plan has critical/error validation issues. Fix them before submitting to review."
        )

    if not import_plan.candidate_objects and not import_plan.candidate_links:
        raise ValueError("Import plan has no candidate objects or links. Nothing to review.")

    # ── Create batch ───────────────────────────────────────────────────
    now = datetime.utcnow()
    batch_id = f"batch-{uuid.uuid4().hex[:12]}"
    batch = ReviewBatch(
        id=batch_id,
        source_type=ReviewSource.IMPORT_PLAN,
        source_id=import_plan.source_profile.source_id if import_plan.source_profile else "",
        source_plan_id=import_plan.plan_id,
        title=f"Import Plan {import_plan.plan_id}",
        description=f"Domain: {import_plan.domain}, "
                    f"Objects: {len(import_plan.candidate_objects)}, "
                    f"Links: {len(import_plan.candidate_links)}",
        status=ReviewBatchStatus.PENDING,
        created_at=now,
        updated_at=now,
    )

    items: list[ReviewItem] = []

    # ── Source metadata from import plan ──────────────────────────────
    source_meta = {}
    if import_plan.metadata.get("source_type") == "custom_csv":
        source_meta = {
            "source_type": "custom_csv",
            "filename": import_plan.metadata.get("filename", ""),
        }

    # ── Candidate objects → review items ───────────────────────────────
    for idx, obj in enumerate(import_plan.candidate_objects):
        item_meta = {**source_meta, "source_row_index": obj.source_row if obj.source_row >= 0 else idx}
        ri = ReviewItem(
            id=f"ri-{uuid.uuid4().hex[:12]}",
            batch_id=batch_id,
            type=ReviewItemType.IMPORT_OBJECT_CANDIDATE,
            title=f"Import object: {obj.type} {obj.id}",
            description=f"Candidate {obj.type} with {len(obj.properties)} properties, "
                        f"confidence {obj.confidence:.0%}",
            status=ReviewItemStatus.PENDING,
            severity=ReviewSeverity.MEDIUM,
            source=ReviewSource.IMPORT_PLAN,
            source_plan_id=import_plan.plan_id,
            candidate_object=obj.model_dump(mode="json"),
            evidence=obj.evidence or "",
            created_at=now,
            updated_at=now,
        )
        if item_meta:
            ri.metadata = item_meta
        items.append(ri)

    # ── Candidate links → review items ─────────────────────────────────
    for idx, link in enumerate(import_plan.candidate_links):
        link_meta = {**source_meta, "source_row_index": link.source_row if link.source_row >= 0 else idx} if source_meta else {}
        ri = ReviewItem(
            id=f"ri-{uuid.uuid4().hex[:12]}",
            batch_id=batch_id,
            type=ReviewItemType.IMPORT_LINK_CANDIDATE,
            title=f"Import link: {link.source_id} -[{link.type}]-> {link.target_id}",
            description=f"Candidate {link.type} link, confidence {link.confidence:.0%}",
            status=ReviewItemStatus.PENDING,
            severity=ReviewSeverity.MEDIUM,
            source=ReviewSource.IMPORT_PLAN,
            source_plan_id=import_plan.plan_id,
            candidate_link=link.model_dump(mode="json"),
            evidence=link.evidence or "",
            created_at=now,
            updated_at=now,
        )
        if link_meta:
            ri.metadata = link_meta
        items.append(ri)

    # ── Validation warnings → review items ─────────────────────────────
    warning_issues = [
        iss for iss in import_plan.validation_issues
        if iss.get("level") in ("warning", "info")
    ]
    for iss in warning_issues:
        sev = ReviewSeverity.LOW if iss.get("level") == "info" else ReviewSeverity.MEDIUM
        items.append(ReviewItem(
            id=f"ri-{uuid.uuid4().hex[:12]}",
            batch_id=batch_id,
            type=ReviewItemType.VALIDATION_WARNING,
            title=iss.get("code", "Validation warning"),
            description=iss.get("message", ""),
            status=ReviewItemStatus.PENDING,
            severity=sev,
            source=ReviewSource.IMPORT_PLAN,
            source_plan_id=import_plan.plan_id,
            validation_issues=[iss],
            created_at=now,
            updated_at=now,
        ))

    # ── Update batch counters ──────────────────────────────────────────
    batch.item_count = len(items)
    batch.pending_count = len(items)

    return ReviewBatchAndItems(batch=batch, items=items)

"""Import Plan Generator — creates validated import plans from mapped data."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from ontology_kernel.models import (
    IssueLevel,
    OntologyGraphPayload,
    OntologySchema,
    RuntimeObject,
    RuntimeLink,
)
from ontology_kernel.validator import validate_graph_payload

from .models import (
    CandidateLink,
    CandidateObject,
    DataSourceProfile,
    ImportPlan,
    ImportPlanSummary,
    LinkMapping,
    ObjectMapping,
    PlanStatus,
    ValidationSummary,
)
from .transformer import generate_candidate_links, generate_candidate_objects


def create_import_plan(
    domain: str,
    profile: DataSourceProfile,
    rows: list[dict[str, Any]],
    object_mappings: list[ObjectMapping],
    link_mappings: list[LinkMapping],
    schema: OntologySchema,
) -> ImportPlan:
    """Create a validated import plan from profiled data and mappings."""
    plan_id = f"plan-{uuid.uuid4().hex[:8]}"

    # 1. Generate candidates
    all_objects: list[CandidateObject] = []
    for om in object_mappings:
        all_objects.extend(generate_candidate_objects(rows, om, schema))

    all_links: list[CandidateLink] = []
    if link_mappings:
        all_links = generate_candidate_links(rows, link_mappings, schema)

    # 2. Convert to OntologyGraphPayload for validation
    runtime_objects = [
        RuntimeObject(
            id=co.id,
            type=co.type,
            properties=co.properties,
            source="data_pipeline",
            confidence=co.confidence,
        )
        for co in all_objects
    ]
    runtime_links = [
        RuntimeLink(
            source_id=cl.source_id,
            target_id=cl.target_id,
            type=cl.type,
            properties=cl.properties,
            source="data_pipeline",
            confidence=cl.confidence,
        )
        for cl in all_links
    ]
    payload = OntologyGraphPayload(nodes=runtime_objects, links=runtime_links)

    # 3. Validate
    issues = validate_graph_payload(payload, schema)
    issue_dicts = [
        {
            "level": issue.level.value,
            "code": issue.code,
            "message": issue.message,
            "object_id": issue.object_id,
            "link_id": issue.link_id,
            "field": issue.field,
        }
        for issue in issues
    ]

    # 4. Determine status
    has_critical = any(i.level == IssueLevel.CRITICAL for i in issues)
    has_error = any(i.level == IssueLevel.ERROR for i in issues)
    has_warning = any(i.level == IssueLevel.WARNING for i in issues)

    if has_critical or has_error:
        status = PlanStatus.HAS_ERRORS
    elif has_warning:
        status = PlanStatus.READY_FOR_REVIEW
    elif all_objects:
        status = PlanStatus.VALIDATED
    else:
        status = PlanStatus.DRAFT

    # 5. Compute summary
    confidences = [co.confidence for co in all_objects] + [cl.confidence for cl in all_links]
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

    summary = ImportPlanSummary(
        new_objects=len(all_objects),
        new_links=len(all_links),
        validation_errors=sum(1 for i in issues if i.level in (IssueLevel.ERROR, IssueLevel.CRITICAL)),
        validation_warnings=sum(1 for i in issues if i.level == IssueLevel.WARNING),
        review_required=len(all_objects) + len(all_links) if has_warning else 0,
        confidence_avg=round(avg_conf, 3),
    )

    return ImportPlan(
        plan_id=plan_id,
        domain=domain,
        source_profile=profile,
        object_mappings=object_mappings,
        link_mappings=link_mappings,
        candidate_objects=all_objects,
        candidate_links=all_links,
        validation_issues=issue_dicts,
        summary=summary,
        status=status,
    )

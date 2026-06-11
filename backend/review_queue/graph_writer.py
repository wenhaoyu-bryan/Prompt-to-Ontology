"""Write approved review items to Neo4j using MERGE (upsert) semantics."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from neo4j import Driver

from neo4j_connector import get_driver
from .models import ReviewApplyResult, ReviewItem, ReviewItemType


def apply_candidate_object(item: ReviewItem, driver: Driver | None = None) -> ReviewApplyResult:
    """MERGE a candidate object node into Neo4j."""
    obj = item.candidate_object
    if not obj:
        return ReviewApplyResult(
            item_id=item.id, status="failed", error="No candidate_object data"
        )

    node_id = obj.get("id", "")
    node_type = obj.get("type", "")
    props = obj.get("properties", {})

    if not node_id or not node_type:
        return ReviewApplyResult(
            item_id=item.id, status="failed", error="Missing object id or type"
        )

    drv = driver or get_driver()
    now = datetime.utcnow().isoformat()

    try:
        with drv.session() as session:
            # Build SET clause dynamically from properties
            set_parts = []
            params: dict[str, Any] = {"node_id": node_id}
            for k, v in props.items():
                safe_key = k.replace(" ", "_").replace("-", "_")
                set_parts.append(f"n.`{safe_key}` = ${safe_key}")
                params[safe_key] = v

            # Metadata
            set_parts.append("n._review_item_id = $review_item_id")
            set_parts.append("n._review_status = 'applied'")
            set_parts.append("n._applied_at = $applied_at")
            set_parts.append("n._confidence = $confidence")
            params["review_item_id"] = item.id
            params["applied_at"] = now
            params["confidence"] = obj.get("confidence", 1.0)

            set_clause = ", ".join(set_parts)
            query = f"MERGE (n:`{node_type}` {{id: $node_id}}) SET {set_clause}"
            session.run(query, **params)

        return ReviewApplyResult(
            item_id=item.id,
            status="applied",
            applied=True,
            graph_object_id=node_id,
            metadata={"type": node_type, "applied_at": now},
        )
    except Exception as e:
        return ReviewApplyResult(
            item_id=item.id, status="failed", error=str(e)
        )


def apply_candidate_link(item: ReviewItem, driver: Driver | None = None) -> ReviewApplyResult:
    """MERGE a candidate relationship into Neo4j."""
    link = item.candidate_link
    if not link:
        return ReviewApplyResult(
            item_id=item.id, status="failed", error="No candidate_link data"
        )

    source_id = link.get("source_id", "")
    target_id = link.get("target_id", "")
    rel_type = link.get("type", "")
    props = link.get("properties", {})

    if not source_id or not target_id or not rel_type:
        return ReviewApplyResult(
            item_id=item.id, status="failed", error="Missing link source_id, target_id, or type"
        )

    drv = driver or get_driver()
    now = datetime.utcnow().isoformat()

    try:
        with drv.session() as session:
            # Verify source and target exist
            check = session.run(
                "MATCH (a {id: $sid}), (b {id: $tid}) RETURN a, b",
                sid=source_id, tid=target_id,
            ).single()
            if not check:
                return ReviewApplyResult(
                    item_id=item.id, status="failed",
                    error=f"Source ({source_id}) or target ({target_id}) node not found",
                )

            # Build SET clause
            set_parts = []
            params: dict[str, Any] = {"sid": source_id, "tid": target_id}
            for k, v in props.items():
                safe_key = k.replace(" ", "_").replace("-", "_")
                set_parts.append(f"r.`{safe_key}` = ${safe_key}")
                params[safe_key] = v

            set_parts.append("r._review_item_id = $review_item_id")
            set_parts.append("r._review_status = 'applied'")
            set_parts.append("r._applied_at = $applied_at")
            set_parts.append("r._confidence = $confidence")
            params["review_item_id"] = item.id
            params["applied_at"] = now
            params["confidence"] = link.get("confidence", 1.0)

            set_clause = ", ".join(set_parts)
            query = (
                f"MATCH (a {{id: $sid}}), (b {{id: $tid}}) "
                f"MERGE (a)-[r:`{rel_type}`]->(b) SET {set_clause}"
            )
            session.run(query, **params)

        return ReviewApplyResult(
            item_id=item.id,
            status="applied",
            applied=True,
            graph_link_id=f"{source_id}-[{rel_type}]->{target_id}",
            metadata={"type": rel_type, "applied_at": now},
        )
    except Exception as e:
        return ReviewApplyResult(
            item_id=item.id, status="failed", error=str(e)
        )


def apply_review_item_to_graph(item: ReviewItem, driver: Driver | None = None) -> ReviewApplyResult:
    """Dispatch to the correct writer based on item type."""
    if item.type == ReviewItemType.IMPORT_OBJECT_CANDIDATE:
        return apply_candidate_object(item, driver)
    elif item.type == ReviewItemType.IMPORT_LINK_CANDIDATE:
        return apply_candidate_link(item, driver)
    else:
        return ReviewApplyResult(
            item_id=item.id,
            status="applied",
            applied=False,
            error=f"Review item type '{item.type.value}' is not graph-applicable yet.",
        )

"""Write approved review items to Neo4j using MERGE (upsert) semantics."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from neo4j import Driver

from neo4j_connector import get_driver
from .models import ReviewApplyResult, ReviewItem, ReviewItemType


def _sanitize_props(props: dict) -> dict:
    """Filter out non-primitive values that Neo4j can't store (nested dicts, etc.)."""
    result = {}
    for k, v in props.items():
        if v is None or isinstance(v, (str, int, float, bool)):
            result[k] = v
        elif isinstance(v, list) and all(isinstance(x, (str, int, float, bool)) for x in v):
            result[k] = v
        # Skip nested dicts and other non-primitive types
    return result


def apply_candidate_object(item: ReviewItem, driver: Driver | None = None) -> ReviewApplyResult:
    """MERGE a candidate object node into Neo4j."""
    obj = item.candidate_object
    if not obj:
        return ReviewApplyResult(
            item_id=item.id, status="failed", error="No candidate_object data"
        )

    node_id = obj.get("id", "")
    node_type = obj.get("type", "")
    props = _sanitize_props(obj.get("properties", {}))

    if not node_id or not node_type:
        return ReviewApplyResult(
            item_id=item.id, status="failed", error="Missing object id or type"
        )

    drv = driver or get_driver()
    now = datetime.utcnow().isoformat()

    try:
        with drv.session() as session:
            set_parts = []
            params: dict[str, Any] = {"node_id": node_id}
            for k, v in props.items():
                safe_key = k.replace(" ", "_").replace("-", "_")
                set_parts.append(f"n.`{safe_key}` = ${safe_key}")
                params[safe_key] = v

            set_parts.append("n._review_item_id = $review_item_id")
            set_parts.append("n._review_status = 'applied'")
            set_parts.append("n._applied_at = $applied_at")
            set_parts.append("n._confidence = $confidence")
            set_parts.append("n.dataset = $dataset")
            params["review_item_id"] = item.id
            params["applied_at"] = now
            params["confidence"] = obj.get("confidence", 1.0)
            params["dataset"] = "pet_food"

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
    props = _sanitize_props(link.get("properties", {}))

    if not source_id or not target_id or not rel_type:
        return ReviewApplyResult(
            item_id=item.id, status="failed", error="Missing link source_id, target_id, or type"
        )

    drv = driver or get_driver()
    now = datetime.utcnow().isoformat()

    try:
        with drv.session() as session:
            check = session.run(
                "MATCH (a {id: $sid}), (b {id: $tid}) RETURN a, b",
                sid=source_id, tid=target_id,
            ).single()
            if not check:
                return ReviewApplyResult(
                    item_id=item.id, status="failed",
                    error=f"Source ({source_id}) or target ({target_id}) node not found",
                )

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
            set_parts.append("r.dataset = $dataset")
            params["review_item_id"] = item.id
            params["applied_at"] = now
            params["confidence"] = link.get("confidence", 1.0)
            params["dataset"] = "pet_food"

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


def _coerce_value(val):
    """Coerce string values to appropriate Python types for Neo4j."""
    if not isinstance(val, str):
        return val
    # Boolean
    if val.lower() == "true":
        return True
    if val.lower() == "false":
        return False
    # Integer
    try:
        int_val = int(val)
        return int_val
    except ValueError:
        pass
    # Float
    try:
        float_val = float(val)
        return float_val
    except ValueError:
        pass
    return val


def apply_agent_property_update(item: ReviewItem, driver: Driver | None = None) -> ReviewApplyResult:
    """Apply an Agent property update suggestion to Neo4j."""
    meta = item.metadata or {}
    prop_update = meta.get("property_update") or {}

    object_id = prop_update.get("object_id") or meta.get("target_object_id", "")
    property_name = prop_update.get("property", "")
    new_value = prop_update.get("new_value")
    old_value = prop_update.get("old_value")

    if not object_id or not property_name or new_value is None:
        return ReviewApplyResult(
            item_id=item.id, status="failed",
            error="Incomplete property_update metadata (need object_id, property, new_value)",
        )

    drv = driver or get_driver()
    now = datetime.utcnow().isoformat()

    try:
        with drv.session() as session:
            # Check object exists
            check = session.run(
                "MATCH (n {id: $oid}) RETURN n", oid=object_id,
            ).single()
            if not check:
                return ReviewApplyResult(
                    item_id=item.id, status="failed",
                    error=f"Target object {object_id} not found",
                )

            # Sanitize property name
            safe_prop = property_name.replace(" ", "_").replace("-", "_")

            # Get old value for metadata
            if old_value is None:
                old_val_result = session.run(
                    f"MATCH (n {{id: $oid}}) RETURN n.`{safe_prop}` AS val",
                    oid=object_id,
                ).single()
                old_value = old_val_result["val"] if old_val_result else None

            # Coerce new value to preserve types
            coerced_value = _coerce_value(new_value)

            # Update property
            session.run(
                f"MATCH (n {{id: $oid}}) "
                f"SET n.`{safe_prop}` = $new_val, "
                f"    n._last_review_item_id = $riid, "
                f"    n._last_agent_run_id = $arid, "
                f"    n._last_updated_by = 'agent_review', "
                f"    n._last_updated_at = $now, "
                f"    n._last_update_reason = $reason",
                oid=object_id,
                new_val=coerced_value,
                riid=item.id,
                arid=meta.get("agent_run_id", ""),
                now=now,
                reason=meta.get("reason", ""),
            )

        return ReviewApplyResult(
            item_id=item.id,
            status="applied",
            applied=True,
            graph_object_id=object_id,
            metadata={
                "property": property_name,
                "old_value": old_value,
                "new_value": new_value,
                "applied_at": now,
            },
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
    elif item.type == ReviewItemType.AGENT_SUGGESTION:
        meta = item.metadata or {}
        if meta.get("agent_action_type") == "SUGGEST_PROPERTY_UPDATE":
            return apply_agent_property_update(item, driver)
        return ReviewApplyResult(
            item_id=item.id, status="failed", applied=False,
            error=f"Agent suggestion type '{meta.get('agent_action_type', 'unknown')}' is not graph-applicable yet.",
        )
    else:
        return ReviewApplyResult(
            item_id=item.id, status="failed", applied=False,
            error=f"Review item type '{item.type.value}' is not graph-applicable.",
        )

"""Write approved review items to Neo4j using MERGE (upsert) semantics."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from neo4j import Driver
from neo4j.exceptions import ConstraintError, DriverError, IncompleteCommit, Neo4jError

from neo4j_connector import get_driver
from ontology_kernel import load_pet_food_schema
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


class _ReviewConflict(Exception):
    pass


def _lock_nodes(tx, ids):
    # Take a write lock before reading values, and hold it until transaction end.
    return tx.run(
        "MATCH (n) WHERE n.id IN $ids "
        "WITH n ORDER BY n.id, elementId(n) "
        "SET n._review_write_lock = true REMOVE n._review_write_lock "
        "RETURN elementId(n) AS element_id, labels(n) AS labels, properties(n) AS properties",
        ids=sorted(set(ids)),
    ).data()


def _same_property(actual, expected):
    if isinstance(actual, list) and isinstance(expected, list):
        return len(actual) == len(expected) and all(
            _same_property(a, b) for a, b in zip(actual, expected)
        )
    return isinstance(actual, bool) == isinstance(expected, bool) and actual == expected


def _different_properties(actual, expected):
    return sorted(key for key, value in expected.items() if not _same_property(actual.get(key), value))


def _check_preview(rows, precondition, props, item_id, identity):
    if len(rows) > 1:
        raise _ReviewConflict(f"Multiple graph records match {identity}; generate a fresh preview.")
    if rows:
        current = rows[0]["properties"]
        expected_element_id = precondition.get("element_id")
        if expected_element_id and rows[0]["element_id"] != expected_element_id:
            raise _ReviewConflict(f"{identity} was replaced; generate a fresh preview.")
        if current.get("_review_item_id") == item_id:
            if _different_properties(current, props):
                raise _ReviewConflict(f"{identity} changed after this review was applied; generate a fresh preview.")
            return True  # A previous graph commit may have succeeded before queue persistence.
    if bool(rows) != precondition["exists"]:
        raise _ReviewConflict(f"Existence changed for {identity}; generate a fresh preview.")
    if rows:
        changed = _different_properties(current, precondition["properties"])
        if changed:
            raise _ReviewConflict(
                f"Preview values changed for {identity}: {', '.join(changed)}; generate a fresh preview."
            )
    return False


def _write_assisted_object(tx, item, obj, precondition, props, write_props, schema):
    node_id, node_type = obj["id"], obj["type"]
    rows = _lock_nodes(tx, [node_id])
    if any(
        set(row["labels"]).intersection(schema.object_types) != {node_type}
        or row["properties"].get("id") != node_id
        for row in rows
    ):
        raise _ReviewConflict(f"Object {node_id} changed identity or type; generate a fresh preview.")
    identity = f"object {node_id}"
    if _check_preview(rows, precondition, props, item.id, identity):
        return rows[0]["properties"].get("_applied_at")
    if rows:
        tx.run(
            "MATCH (n) WHERE elementId(n) = $element_id "
            "SET n += $props RETURN elementId(n) AS element_id",
            element_id=rows[0]["element_id"], props=write_props,
        ).single(strict=True)
        return
    primary_key = schema.object_types[node_type].primary_key
    # Use the schema's unique key for concurrent same-type creation on provisioned graphs.
    created = tx.run(
        f"MERGE (n:`{node_type}` {{`{primary_key}`: $node_id}}) "
        "ON CREATE SET n += $props RETURN properties(n) AS properties",
        node_id=node_id, props={**write_props, "id": node_id},
    ).data()
    if not _check_preview(created, precondition, {**props, "id": node_id}, item.id, identity):
        raise _ReviewConflict(f"Object {node_id} could not be created; generate a fresh preview.")
    return created[0]["properties"].get("_applied_at")


def _write_assisted_link(tx, item, link, precondition, props, write_props, schema):
    source_id, target_id, rel_type = link["source_id"], link["target_id"], link["type"]
    identity = f"link {source_id}-[{rel_type}]->{target_id}"
    nodes = _lock_nodes(tx, [source_id, target_id])
    endpoints = []
    for side, node_id in (("source", source_id), ("target", target_id)):
        rows = [row for row in nodes if row["properties"].get("id") == node_id]
        expected_type = precondition[f"{side}_type"]
        expected_element_id = precondition.get(f"{side}_element_id")
        if (
            len(rows) != 1
            or set(rows[0]["labels"]).intersection(schema.object_types) != {expected_type}
            or (expected_element_id and rows[0]["element_id"] != expected_element_id)
        ):
            raise _ReviewConflict(
                f"Link {side} {node_id} is missing, ambiguous or changed; generate a fresh preview."
            )
        endpoints.append(rows[0]["element_id"])

    match_nodes = "MATCH (a), (b) WHERE elementId(a) = $source AND elementId(b) = $target "
    params = {"source": endpoints[0], "target": endpoints[1]}
    rows = tx.run(
        match_nodes + f"MATCH (a)-[r:`{rel_type}`]->(b) "
        "SET r._review_write_lock = true REMOVE r._review_write_lock "
        "RETURN elementId(r) AS element_id, properties(r) AS properties",
        **params,
    ).data()
    if _check_preview(rows, precondition, props, item.id, identity):
        return rows[0]["properties"].get("_applied_at")
    if rows:
        tx.run(
            "MATCH ()-[r]->() WHERE elementId(r) = $element_id "
            "SET r += $props RETURN elementId(r) AS element_id",
            element_id=rows[0]["element_id"], props=write_props,
        ).single(strict=True)
        return
    created = tx.run(
        match_nodes + f"MERGE (a)-[r:`{rel_type}`]->(b) "
        "ON CREATE SET r += $props RETURN properties(r) AS properties",
        props=write_props, **params,
    ).data()
    if not _check_preview(created, precondition, props, item.id, identity):
        raise _ReviewConflict(f"The {identity} could not be created; generate a fresh preview.")
    return created[0]["properties"].get("_applied_at")


def _apply_assisted_candidate(item: ReviewItem, driver: Driver | None) -> ReviewApplyResult:
    """Compare the accepted preview and write the item in one graph transaction."""
    try:
        is_object = item.type == ReviewItemType.IMPORT_OBJECT_CANDIDATE
        candidate = (item.candidate_object if is_object else item.candidate_link) or {}
        precondition = item.metadata.get("apply_precondition")
        props = candidate.get("properties", {})
        if (
            not isinstance(precondition, dict)
            or type(precondition.get("exists")) is not bool
            or not isinstance(precondition.get("properties"), dict)
            or set(precondition["properties"]) != (set(props) if precondition["exists"] else set())
        ):
            raise _ReviewConflict("Accepted preview evidence is missing; submit a fresh preview for review.")
        schema = load_pet_food_schema()
        kind = candidate.get("type", "")
        definition = (schema.object_types if is_object else schema.link_types).get(kind)
        if not definition or not kind.isidentifier():
            raise _ReviewConflict("Candidate type is unavailable; generate a fresh preview.")
        if is_object:
            if not candidate.get("id") or not definition.primary_key.isidentifier():
                raise _ReviewConflict("Candidate object identity is invalid; generate a fresh preview.")
            writer = _write_assisted_object
        else:
            if (
                not candidate.get("source_id") or not candidate.get("target_id")
                or precondition.get("source_type") != definition.source_type
                or precondition.get("target_type") != definition.target_type
            ):
                raise _ReviewConflict("Accepted link endpoint evidence is invalid; submit a fresh preview for review.")
            writer = _write_assisted_link
        if _sanitize_props(props) != props or any(key == "id" or key.startswith("_") for key in props):
            raise _ReviewConflict("Candidate properties cannot be stored; generate a fresh preview.")

        now = datetime.utcnow().isoformat()
        write_props = {
            **props, "_review_item_id": item.id, "_review_status": "applied",
            "_applied_at": now, "_confidence": candidate.get("confidence", 1.0),
            "dataset": "pet_food",
        }
        with (driver or get_driver()).session() as session:
            applied_at = session.execute_write(
                lambda tx: writer(tx, item, candidate, precondition, props, write_props, schema)
            ) or now
        return ReviewApplyResult(
            item_id=item.id, status="applied", applied=True,
            graph_object_id=candidate["id"] if is_object else "",
            graph_link_id=(
                f"{candidate['source_id']}-[{kind}]->{candidate['target_id']}" if not is_object else ""
            ),
            metadata={"type": kind, "applied_at": applied_at},
        )
    except _ReviewConflict as exc:
        return ReviewApplyResult(item_id=item.id, status="conflict", error=str(exc))
    except ConstraintError:
        return ReviewApplyResult(
            item_id=item.id, status="conflict",
            error="Graph constraints blocked this write; generate a fresh preview.",
        )
    except (DriverError, Neo4jError) as exc:
        if isinstance(exc, IncompleteCommit) or exc.is_retryable():
            return ReviewApplyResult(
                item_id=item.id, status="retryable", error="Graph write could not complete; retry the approved item.",
            )
        return ReviewApplyResult(item_id=item.id, status="failed", error=str(exc))
    except Exception as exc:
        return ReviewApplyResult(item_id=item.id, status="failed", error=str(exc))


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
    if item.metadata.get("assisted_build_run_id") and item.type in (
        ReviewItemType.IMPORT_OBJECT_CANDIDATE, ReviewItemType.IMPORT_LINK_CANDIDATE,
    ):
        return _apply_assisted_candidate(item, driver)
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

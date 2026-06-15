"""Core service for Graph Snapshot, Diff & Rollback.

Provides snapshot creation from Neo4j, comparison between snapshots,
and restore (rollback) functionality.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any

from neo4j_connector import get_driver

from .models import (
    DiffNodeChange,
    DiffSummary,
    GraphDiff,
    GraphSnapshot,
    RestoreResult,
    SnapshotNode,
    SnapshotRelationship,
)
from .storage import load_diffs, load_snapshots, save_diffs, save_snapshots


# ── Helpers ───────────────────────────────────────────────────────

def _sanitize_props(props: dict) -> dict:
    """Filter out non-primitive values that Neo4j can't store."""
    result: dict[str, Any] = {}
    for k, v in props.items():
        if v is None or isinstance(v, (str, int, float, bool)):
            result[k] = v
        elif isinstance(v, list) and all(isinstance(x, (str, int, float, bool)) for x in v):
            result[k] = v
        # Skip nested dicts and other non-primitive types
    return result


def _new_snapshot_id() -> str:
    return f"snap-{uuid.uuid4().hex[:12]}"


def _new_diff_id() -> str:
    return f"diff-{uuid.uuid4().hex[:12]}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Snapshot CRUD ─────────────────────────────────────────────────

def create_snapshot(
    reason: str,
    title: str = "",
    metadata: dict | None = None,
) -> GraphSnapshot:
    """Query Neo4j for all nodes and relationships, serialize to a snapshot."""
    driver = get_driver()

    # Collect all nodes
    nodes: list[SnapshotNode] = []
    with driver.session() as session:
        result = session.run("MATCH (n) RETURN n, labels(n) AS lbls")
        for record in result:
            node = record["n"]
            labels = record["lbls"]
            props = _sanitize_props(dict(node))
            # Remove internal id if present
            node_id = props.pop("id", None) or str(node.element_id)
            nodes.append(SnapshotNode(
                id=node_id,
                labels=labels,
                properties=props,
            ))

    # Collect all relationships
    rels: list[SnapshotRelationship] = []
    with driver.session() as session:
        result = session.run(
            "MATCH (a)-[r]->(b) RETURN a.id AS src, b.id AS tgt, type(r) AS rtype, properties(r) AS props"
        )
        for record in result:
            src = record["src"] or ""
            tgt = record["tgt"] or ""
            rtype = record["rtype"]
            props = _sanitize_props(dict(record["props"]))
            rels.append(SnapshotRelationship(
                source_id=src,
                target_id=tgt,
                type=rtype,
                properties=props,
            ))

    snapshot = GraphSnapshot(
        snapshot_id=_new_snapshot_id(),
        title=title,
        reason=reason,
        node_count=len(nodes),
        relationship_count=len(rels),
        nodes=nodes,
        relationships=rels,
        metadata=metadata or {},
        created_at=_now(),
    )

    # Persist
    snapshots = load_snapshots()
    snapshots.append(snapshot)
    save_snapshots(snapshots)

    return snapshot


def list_snapshots(limit: int = 50) -> list[GraphSnapshot]:
    """Return most recent snapshots."""
    snapshots = load_snapshots()
    return snapshots[-limit:]


def get_snapshot(snapshot_id: str) -> GraphSnapshot | None:
    """Return a single snapshot by ID."""
    for snap in load_snapshots():
        if snap.snapshot_id == snapshot_id:
            return snap
    return None


# ── Diff ──────────────────────────────────────────────────────────

def _rel_key(rel: SnapshotRelationship) -> tuple[str, str, str]:
    """Stable key for relationship comparison."""
    return (rel.source_id, rel.target_id, rel.type)


def compare_snapshots(before_id: str, after_id: str) -> GraphDiff:
    """Compare two snapshots and compute added/removed/changed nodes and relationships."""
    before = get_snapshot(before_id)
    after = get_snapshot(after_id)
    if before is None:
        raise ValueError(f"Snapshot not found: {before_id}")
    if after is None:
        raise ValueError(f"Snapshot not found: {after_id}")

    # Index nodes by id
    before_nodes = {n.id: n for n in before.nodes}
    after_nodes = {n.id: n for n in after.nodes}

    before_ids = set(before_nodes.keys())
    after_ids = set(after_nodes.keys())

    # Added / removed nodes
    nodes_added = [after_nodes[nid] for nid in (after_ids - before_ids)]
    nodes_removed = [before_nodes[nid] for nid in (before_ids - after_ids)]

    # Changed nodes
    nodes_changed: list[DiffNodeChange] = []
    for nid in before_ids & after_ids:
        b_props = before_nodes[nid].properties
        a_props = after_nodes[nid].properties
        all_keys = set(b_props.keys()) | set(a_props.keys())
        changed = [k for k in sorted(all_keys) if b_props.get(k) != a_props.get(k)]
        if changed:
            nodes_changed.append(DiffNodeChange(
                id=nid,
                before=b_props,
                after=a_props,
                changed_fields=changed,
            ))

    # Index relationships by composite key
    before_rels = {_rel_key(r): r for r in before.relationships}
    after_rels = {_rel_key(r): r for r in after.relationships}

    before_rkeys = set(before_rels.keys())
    after_rkeys = set(after_rels.keys())

    rels_added = [after_rels[k] for k in (after_rkeys - before_rkeys)]
    rels_removed = [before_rels[k] for k in (before_rkeys - after_rkeys)]

    # Changed relationships (same key, different properties)
    rels_changed: list[dict[str, Any]] = []
    for k in before_rkeys & after_rkeys:
        b_props = before_rels[k].properties
        a_props = after_rels[k].properties
        all_keys = set(b_props.keys()) | set(a_props.keys())
        changed = [fld for fld in sorted(all_keys) if b_props.get(fld) != a_props.get(fld)]
        if changed:
            rels_changed.append({
                "source_id": k[0],
                "target_id": k[1],
                "type": k[2],
                "before": b_props,
                "after": a_props,
                "changed_fields": changed,
            })

    summary = DiffSummary(
        nodes_added=len(nodes_added),
        nodes_removed=len(nodes_removed),
        nodes_changed=len(nodes_changed),
        relationships_added=len(rels_added),
        relationships_removed=len(rels_removed),
        relationships_changed=len(rels_changed),
    )

    diff = GraphDiff(
        diff_id=_new_diff_id(),
        before_snapshot_id=before_id,
        after_snapshot_id=after_id,
        summary=summary,
        nodes_added=nodes_added,
        nodes_removed=nodes_removed,
        nodes_changed=nodes_changed,
        relationships_added=rels_added,
        relationships_removed=rels_removed,
        relationships_changed=rels_changed,
        created_at=_now(),
    )

    diffs = load_diffs()
    diffs.append(diff)
    save_diffs(diffs)

    return diff


def list_diffs(limit: int = 50) -> list[GraphDiff]:
    """Return most recent diffs."""
    diffs = load_diffs()
    return diffs[-limit:]


def get_diff(diff_id: str) -> GraphDiff | None:
    """Return a single diff by ID."""
    for d in load_diffs():
        if d.diff_id == diff_id:
            return d
    return None


# ── Restore / Rollback ────────────────────────────────────────────

def restore_snapshot(snapshot_id: str, confirm: bool = False) -> RestoreResult:
    """Restore graph from a snapshot. Requires confirm=True.

    Steps:
    1. Validate confirm flag
    2. Create a safety snapshot of the current state
    3. Clear the graph
    4. Recreate nodes from the snapshot
    5. Recreate relationships from the snapshot
    6. Refresh the in-memory graph cache
    7. Return a RestoreResult
    """
    if not confirm:
        raise ValueError("Restore requires confirm=True to proceed.")

    snapshot = get_snapshot(snapshot_id)
    if snapshot is None:
        raise ValueError(f"Snapshot not found: {snapshot_id}")

    driver = get_driver()

    # 1. Safety snapshot of current state
    safety = create_snapshot(reason="rollback_restore", title=f"safety before restoring {snapshot_id}")

    # 2. Clear graph
    with driver.session() as session:
        session.run("MATCH (n) DETACH DELETE n")

    # 3. Recreate nodes
    for snap_node in snapshot.nodes:
        for label in snap_node.labels:
            # Escape label for Cypher
            safe_label = label.replace("`", "")
            props = dict(snap_node.properties)
            props["id"] = snap_node.id
            query = f"MERGE (n:`{safe_label}` {{id: $id}}) SET n += $props"
            with driver.session() as session:
                session.run(query, id=snap_node.id, props=_sanitize_props(props))

    # 4. Recreate relationships
    for snap_rel in snapshot.relationships:
        safe_type = snap_rel.type.replace("`", "")
        query = (
            f"MATCH (a {{id: $src}}), (b {{id: $tgt}}) "
            f"MERGE (a)-[r:`{safe_type}`]->(b) SET r += $props"
        )
        with driver.session() as session:
            session.run(
                query,
                src=snap_rel.source_id,
                tgt=snap_rel.target_id,
                props=_sanitize_props(snap_rel.properties),
            )

    # 5. Refresh graph cache
    from ontology import refresh_graph
    refresh_graph()

    return RestoreResult(
        restored_snapshot_id=snapshot_id,
        safety_snapshot_id=safety.snapshot_id,
        nodes_restored=snapshot.node_count,
        relationships_restored=snapshot.relationship_count,
        status="restored",
    )


def is_restore_enabled() -> bool:
    """Check whether snapshot restore is enabled via env var."""
    return os.environ.get("SNAPSHOT_RESTORE_ENABLED", "true").lower() == "true"

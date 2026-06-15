"""Smoke test for Graph Snapshot, Diff & Rollback module."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from neo4j_connector import get_driver
from graph_snapshot import (
    create_snapshot,
    list_snapshots,
    get_snapshot,
    compare_snapshots,
    restore_snapshot,
    is_restore_enabled,
)

passed = 0
failed = 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name} {detail}")


# ── Setup ───────────────────────────────────────────────────────────────
drv = get_driver()

print("=" * 60)
print("Graph Snapshot — Smoke Test")
print("=" * 60)

# ── 1. Create snapshot from empty graph ────────────────────────────────
print("\n[1] Snapshot Empty Graph")

# Reset graph to clean state
try:
    with drv.session() as session:
        session.run("MATCH (n) DETACH DELETE n")
except Exception:
    pass

snap_empty = create_snapshot(reason="test", title="empty")
check("Empty snapshot has 0 nodes", snap_empty.node_count == 0, f"got {snap_empty.node_count}")
check("Empty snapshot has 0 relationships", snap_empty.relationship_count == 0, f"got {snap_empty.relationship_count}")

# ── 2. Snapshot uses application-level node IDs ────────────────────────
print("\n[2] Snapshot Node ID from Properties")

with drv.session() as session:
    session.run(
        "MERGE (n:TestNode {id: $id}) SET n.name = $name, n.value = $value",
        id="snap_test_node_a", name="Alpha", value=10,
    )

snap_with_node = create_snapshot(reason="test", title="one_node")
check("Snapshot has 1 node", snap_with_node.node_count == 1, f"got {snap_with_node.node_count}")
snap_node = snap_with_node.nodes[0]
check("Node ID is application-level", snap_node.id == "snap_test_node_a", f"got {snap_node.id}")
check("Node has 'id' not in properties dict", "id" not in snap_node.properties)
check("Node has name property", snap_node.properties.get("name") == "Alpha")

# ── 3. Snapshot serializes relationships ───────────────────────────────
print("\n[3] Snapshot Relationship Fields")

with drv.session() as session:
    session.run(
        "MERGE (n:TestNode {id: $id}) SET n.name = $name, n.value = $value",
        id="snap_test_node_b", name="Beta", value=20,
    )
    session.run(
        "MATCH (a {id: $src}), (b {id: $tgt}) MERGE (a)-[r:TEST_REL]->(b)",
        src="snap_test_node_a", tgt="snap_test_node_b",
    )

snap_with_rel = create_snapshot(reason="test", title="one_rel")
check("Snapshot has 2 nodes", snap_with_rel.node_count == 2, f"got {snap_with_rel.node_count}")
check("Snapshot has 1 relationship", snap_with_rel.relationship_count == 1, f"got {snap_with_rel.relationship_count}")

first_rel = snap_with_rel.relationships[0]
check("Relationship has source_id", first_rel.source_id == "snap_test_node_a", f"got {first_rel.source_id}")
check("Relationship has target_id", first_rel.target_id == "snap_test_node_b", f"got {first_rel.target_id}")
check("Relationship has type", first_rel.type == "TEST_REL", f"got {first_rel.type}")

# ── 4. Compare empty → populated ──────────────────────────────────────
print("\n[4] Diff: Empty to Populated")

diff_add = compare_snapshots(snap_empty.snapshot_id, snap_with_rel.snapshot_id)
check("Diff summary nodes_added > 0", diff_add.summary.nodes_added > 0, f"got {diff_add.summary.nodes_added}")
check("Diff summary rels_added > 0", diff_add.summary.relationships_added > 0, f"got {diff_add.summary.relationships_added}")
check("Diff summary nodes_added == 2", diff_add.summary.nodes_added == 2, f"got {diff_add.summary.nodes_added}")
check("Diff summary rels_added == 1", diff_add.summary.relationships_added == 1, f"got {diff_add.summary.relationships_added}")

# ── 5. Compare with changed property ───────────────────────────────────
print("\n[5] Diff: Changed Property")

snap_state_a = create_snapshot(reason="test", title="state_a")

with drv.session() as session:
    session.run(
        "MATCH (n:TestNode {id: $id}) SET n.name = $name",
        id="snap_test_node_a", name="AlphaModified",
    )

snap_state_b = create_snapshot(reason="test", title="state_b")

diff_chg = compare_snapshots(snap_state_a.snapshot_id, snap_state_b.snapshot_id)
check("Diff has 1 node changed", diff_chg.summary.nodes_changed == 1, f"got {diff_chg.summary.nodes_changed}")
check("Diff has 0 nodes added", diff_chg.summary.nodes_added == 0, f"got {diff_chg.summary.nodes_added}")
changed_node = diff_chg.nodes_changed[0]
check("Changed node is snap_test_node_a", changed_node.id == "snap_test_node_a", f"got {changed_node.id}")
check("Changed fields includes 'name'", "name" in changed_node.changed_fields)
check("Before name is Alpha", changed_node.before.get("name") == "Alpha")
check("After name is AlphaModified", changed_node.after.get("name") == "AlphaModified")

# ── 6. Restore requires confirm=true ───────────────────────────────────
print("\n[6] Restore Requires Confirm")

try:
    restore_snapshot(snap_state_a.snapshot_id, confirm=False)
    check("ValueError raised without confirm", False, "no exception raised")
except ValueError as e:
    check("ValueError raised without confirm", "confirm=True" in str(e))
except Exception as e:
    check("ValueError raised without confirm", False, f"got {type(e).__name__}: {e}")

# ── 7. Restore creates safety snapshot ─────────────────────────────────
print("\n[7] Restore Creates Safety Snapshot")

snap_before_restore = create_snapshot(reason="test", title="before_restore")

result = restore_snapshot(snap_state_a.snapshot_id, confirm=True)
check("RestoreResult has safety_snapshot_id", bool(result.safety_snapshot_id))
check("Safety snapshot exists", get_snapshot(result.safety_snapshot_id) is not None)
check("Safety snapshot ID starts with snap-", result.safety_snapshot_id.startswith("snap-"))
check("Restore status is 'restored'", result.status == "restored")

# ── 8. Restore clears graph and restores nodes/relationships ───────────
print("\n[8] Restore Clears and Restores Graph")

# First restore the empty snapshot to clear everything
restore_snapshot(snap_empty.snapshot_id, confirm=True)
count_after_empty = 0
with drv.session() as session:
    res = session.run("MATCH (n:TestNode) RETURN count(n) AS cnt")
    count_after_empty = res.single()["cnt"]
check("Graph is empty after restoring empty snapshot", count_after_empty == 0, f"got {count_after_empty}")

# Now restore a populated snapshot
restore_snapshot(snap_with_rel.snapshot_id, confirm=True)
count_after_pop = 0
rel_count_after_pop = 0
with drv.session() as session:
    res = session.run("MATCH (n:TestNode) RETURN count(n) AS cnt")
    count_after_pop = res.single()["cnt"]
    res2 = session.run("MATCH ()-[r:TEST_REL]->() RETURN count(r) AS cnt")
    rel_count_after_pop = res2.single()["cnt"]
check("Graph has 2 nodes after restoring populated snapshot", count_after_pop == 2, f"got {count_after_pop}")
check("Graph has 1 relationship after restoring populated snapshot", rel_count_after_pop == 1, f"got {rel_count_after_pop}")

# ── 9. Snapshot ID format ──────────────────────────────────────────────
print("\n[9] Snapshot ID Format")

check("Snapshot ID starts with 'snap-'", snap_empty.snapshot_id.startswith("snap-"), f"got {snap_empty.snapshot_id}")
check("Snapshot ID length is 17", len(snap_empty.snapshot_id) == 17, f"got len={len(snap_empty.snapshot_id)}")

# ── 10. Diff ID format ────────────────────────────────────────────────
print("\n[10] Diff ID Format")

check("Diff ID starts with 'diff-'", diff_add.diff_id.startswith("diff-"), f"got {diff_add.diff_id}")
check("Diff ID length is 17", len(diff_add.diff_id) == 17, f"got len={len(diff_add.diff_id)}")

# ── 11. List snapshots returns ordered results ─────────────────────────
print("\n[11] List Snapshots")

snapshots = list_snapshots()
check("list_snapshots returns multiple entries", len(snapshots) >= 5, f"got {len(snapshots)}")
# All created snapshot IDs should be present in the list
snap_ids = [s.snapshot_id for s in snapshots]
check("List contains snap_empty", snap_empty.snapshot_id in snap_ids)
check("List contains snap_before_restore", snap_before_restore.snapshot_id in snap_ids)
check("List is in creation order", snap_ids.index(snap_empty.snapshot_id) < snap_ids.index(snap_before_restore.snapshot_id))

# ── 12. Restore enabled check ─────────────────────────────────────────
print("\n[12] is_restore_enabled")

check("is_restore_enabled returns True by default", is_restore_enabled() is True)

# ── Cleanup ────────────────────────────────────────────────────────────
try:
    with drv.session() as session:
        session.run("MATCH (n:TestNode) DETACH DELETE n")
except Exception:
    pass  # Cleanup is best-effort

# Also clean up snapshot/diff files to avoid polluting other tests
try:
    runtime_dir = Path(__file__).resolve().parent.parent / ".runtime"
    snap_file = runtime_dir / "graph_snapshots.json"
    diff_file = runtime_dir / "graph_diffs.json"
    if snap_file.exists():
        snap_file.unlink()
    if diff_file.exists():
        diff_file.unlink()
except Exception:
    pass

# ── Summary ────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
total = passed + failed
print(f"Results: {passed}/{total} passed")
if failed > 0:
    print(f"  {failed} FAILED")
    sys.exit(1)
else:
    print("All tests passed!")
    sys.exit(0)

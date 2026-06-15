"""Graph Snapshot, Diff & Rollback — Phase 37.

Provides snapshot creation, comparison, and restore capabilities
for the Neo4j graph database.
"""

from .models import (
    DiffNodeChange,
    DiffSummary,
    GraphDiff,
    GraphSnapshot,
    RestoreResult,
    SnapshotNode,
    SnapshotRelationship,
)
from .service import (
    compare_snapshots,
    create_snapshot,
    get_diff,
    get_snapshot,
    is_restore_enabled,
    list_diffs,
    list_snapshots,
    restore_snapshot,
)

__all__ = [
    "DiffNodeChange",
    "DiffSummary",
    "GraphDiff",
    "GraphSnapshot",
    "RestoreResult",
    "SnapshotNode",
    "SnapshotRelationship",
    "compare_snapshots",
    "create_snapshot",
    "get_diff",
    "get_snapshot",
    "is_restore_enabled",
    "list_diffs",
    "list_snapshots",
    "restore_snapshot",
]

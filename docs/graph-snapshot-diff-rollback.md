# Graph Snapshot, Diff & Rollback

## Why This Exists

The ontology runtime has multiple graph mutation paths (sample import, full build scenario, custom CSV upload, agent suggestions, review queue apply). This feature makes all graph mutations traceable, comparable, and reversible.

## What Is Captured

Each snapshot captures:
- All runtime graph nodes (id, labels, properties)
- All runtime graph relationships (source_id, target_id, type, properties)
- Metadata: reason, title, timestamps, associated review batch IDs

## What Is Not Captured

- Ontology schema definitions (object types, link types, rules) — these are managed separately
- Review queue decisions (approve/reject history)
- Neo4j internal IDs — only application-level `id` property is used
- Agent conversation history

## Snapshot Lifecycle

```text
1. Snapshot created (manual, before/after apply, demo reset)
2. Graph mutated
3. After snapshot created
4. Diff computed between before/after
5. Diff stored with metadata
6. Any snapshot can be restored
```

## Diff Model

A diff compares two snapshots and produces:
- Nodes added / removed / changed (with changed property fields)
- Relationships added / removed / changed
- Summary counts

## Rollback Safety

Restore safety rules:
- Restore requires `confirm=true`
- A safety snapshot is created before clearing the graph
- Restore only affects graph instance data
- Restore does not delete schema or review queue history
- Restore can be disabled via `SNAPSHOT_RESTORE_ENABLED=false`

## Review Queue Integration

When applying a review batch:
1. Before snapshot is created automatically
2. Items are applied
3. After snapshot is created
4. Diff is computed and returned in the response

## API Endpoints

```http
GET  /api/graph/snapshots          — List all snapshots
GET  /api/graph/snapshots/{id}     — Get single snapshot
POST /api/graph/snapshots          — Create manual snapshot
POST /api/graph/snapshots/compare  — Compare two snapshots
GET  /api/graph/diffs              — List all diffs
GET  /api/graph/diffs/{id}         — Get single diff
POST /api/graph/snapshots/{id}/restore — Restore from snapshot
```

## Manual QA Flow

1. Reset to Clean Graph Build Mode
2. Open Graph Governance page
3. Create manual snapshot (should show 0 nodes/rels)
4. Upload and apply custom CSV objects
5. Confirm review batch apply creates before/after snapshots
6. Compare empty vs populated snapshot — verify diff shows added nodes
7. Restore the empty snapshot — verify graph becomes empty
8. Restore the populated snapshot — verify graph returns
9. Check Object Explorer and Graph Explorer work with restored graph

## Known Limitations

- This versions runtime graph instances, not ontology schema files
- Rollback restores graph state, not review queue decisions
- Snapshot storage is JSON file-based, not production-grade backup
- Large graphs (>1000 nodes) may have slow snapshot/restore operations
- Neo4j internal IDs are not used or preserved

"""Pydantic models for Graph Snapshot, Diff & Rollback."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SnapshotNode(BaseModel):
    id: str
    labels: list[str]
    properties: dict[str, Any]


class SnapshotRelationship(BaseModel):
    source_id: str
    target_id: str
    type: str
    properties: dict[str, Any]


class GraphSnapshot(BaseModel):
    snapshot_id: str
    title: str = ""
    reason: str  # before_batch_apply | after_batch_apply | manual | rollback_restore | demo_reset
    domain: str = "pet_food"
    node_count: int = 0
    relationship_count: int = 0
    nodes: list[SnapshotNode] = Field(default_factory=list)
    relationships: list[SnapshotRelationship] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class DiffNodeChange(BaseModel):
    id: str
    before: dict[str, Any] = Field(default_factory=dict)
    after: dict[str, Any] = Field(default_factory=dict)
    changed_fields: list[str] = Field(default_factory=list)


class DiffSummary(BaseModel):
    nodes_added: int = 0
    nodes_removed: int = 0
    nodes_changed: int = 0
    relationships_added: int = 0
    relationships_removed: int = 0
    relationships_changed: int = 0


class GraphDiff(BaseModel):
    diff_id: str
    before_snapshot_id: str
    after_snapshot_id: str
    summary: DiffSummary
    nodes_added: list[SnapshotNode] = Field(default_factory=list)
    nodes_removed: list[SnapshotNode] = Field(default_factory=list)
    nodes_changed: list[DiffNodeChange] = Field(default_factory=list)
    relationships_added: list[SnapshotRelationship] = Field(default_factory=list)
    relationships_removed: list[SnapshotRelationship] = Field(default_factory=list)
    relationships_changed: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class RestoreResult(BaseModel):
    restored_snapshot_id: str
    safety_snapshot_id: str
    nodes_restored: int = 0
    relationships_restored: int = 0
    status: str = "restored"

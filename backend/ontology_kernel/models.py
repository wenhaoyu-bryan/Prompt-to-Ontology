"""Typed Pydantic models for the ontology runtime kernel."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────────

class PropertyType(str, Enum):
    STRING = "string"
    NUMBER = "number"
    INTEGER = "integer"
    BOOLEAN = "boolean"
    ENUM = "enum"
    LIST = "list"
    OBJECT = "object"
    DATE = "date"
    DATETIME = "datetime"


class Cardinality(str, Enum):
    ONE_TO_ONE = "ONE_TO_ONE"
    ONE_TO_MANY = "ONE_TO_MANY"
    MANY_TO_ONE = "MANY_TO_ONE"
    MANY_TO_MANY = "MANY_TO_MANY"


class RuleStatus(str, Enum):
    TRIGGERED = "triggered"
    PASSED = "passed"
    NOT_EVALUABLE = "not_evaluable"
    NOT_APPLICABLE = "not_applicable"


class ReviewStatus(str, Enum):
    AUTO_GENERATED = "auto_generated"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"


class IssueLevel(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


# ── Schema Definition Models ──────────────────────────────────────────────

class PropertyDef(BaseModel):
    name: str
    type: PropertyType = PropertyType.STRING
    required: bool = False
    description: str = ""
    enum_values: list[str] = Field(default_factory=list)
    default: Any = None
    unit: str = ""
    source_field: str = ""


class ObjectTypeDef(BaseModel):
    name: str
    label: str = ""
    description: str = ""
    properties: list[PropertyDef] = Field(default_factory=list)
    primary_key: str = ""
    display_name: str = ""
    required_properties: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class LinkTypeDef(BaseModel):
    name: str
    label: str = ""
    description: str = ""
    source_type: str = ""
    target_type: str = ""
    cardinality: Cardinality = Cardinality.MANY_TO_MANY
    direction: str = "outgoing"
    required: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class ConstraintDef(BaseModel):
    name: str
    description: str = ""
    constraint_type: str = ""  # required_fields, enum, non_negative, etc.
    parameters: dict[str, Any] = Field(default_factory=dict)
    target_type: str = ""


class RuleDef(BaseModel):
    rule_id: str
    name: str
    severity: str = "info"
    description: str = ""
    condition_type: str = ""
    condition_params: dict[str, Any] = Field(default_factory=dict)
    output_link_type: str = "TRIGGERS_RISK"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ActionTypeDef(BaseModel):
    name: str
    description: str = ""
    params: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


# ── Top-Level Schema ─────────────────────────────────────────────────────

class OntologySchema(BaseModel):
    domain: str
    version: str = "1.0.0"
    object_types: dict[str, ObjectTypeDef] = Field(default_factory=dict)
    link_types: dict[str, LinkTypeDef] = Field(default_factory=dict)
    rules: dict[str, RuleDef] = Field(default_factory=dict)
    actions: dict[str, ActionTypeDef] = Field(default_factory=dict)
    constraints: dict[str, ConstraintDef] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


# ── Runtime Models ────────────────────────────────────────────────────────

class RuntimeObject(BaseModel):
    id: str
    type: str
    properties: dict[str, Any] = Field(default_factory=dict)
    source: str = ""
    confidence: float = 1.0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RuntimeLink(BaseModel):
    source_id: str
    target_id: str
    type: str
    properties: dict[str, Any] = Field(default_factory=dict)
    source: str = ""
    confidence: float = 1.0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    evidence: list[EvidenceMetadata] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EvidenceMetadata(BaseModel):
    source_type: str = ""  # rule, agent, manual, import
    source_id: str = ""
    source_field: str = ""
    reason: str = ""
    confidence: float = 1.0
    generated_by: str = ""
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    review_status: ReviewStatus = ReviewStatus.AUTO_GENERATED
    raw_payload: dict[str, Any] = Field(default_factory=dict)


class ValidationIssue(BaseModel):
    level: IssueLevel = IssueLevel.WARNING
    code: str = ""
    message: str = ""
    object_id: str = ""
    link_id: str = ""
    field: str = ""
    expected: str = ""
    actual: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class OntologyGraphPayload(BaseModel):
    nodes: list[RuntimeObject] = Field(default_factory=list)
    links: list[RuntimeLink] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

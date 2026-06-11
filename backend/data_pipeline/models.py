"""Data Pipeline models."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class InferredType(str, Enum):
    STRING = "string"
    NUMBER = "number"
    INTEGER = "integer"
    BOOLEAN = "boolean"
    DATE = "date"
    DATETIME = "datetime"
    UNKNOWN = "unknown"


class MappingType(str, Enum):
    EXACT = "exact"
    FUZZY = "fuzzy"
    MANUAL = "manual"
    SUGGESTED = "suggested"


class PlanStatus(str, Enum):
    DRAFT = "draft"
    VALIDATED = "validated"
    HAS_ERRORS = "has_errors"
    READY_FOR_REVIEW = "ready_for_review"


class ColumnProfile(BaseModel):
    name: str
    inferred_type: InferredType = InferredType.STRING
    null_count: int = 0
    null_rate: float = 0.0
    unique_count: int = 0
    sample_values: list[Any] = Field(default_factory=list)
    min_value: Any = None
    max_value: Any = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class DataSourceProfile(BaseModel):
    source_id: str
    source_name: str
    source_type: str = "csv"  # csv, sample, json
    row_count: int = 0
    column_count: int = 0
    columns: list[ColumnProfile] = Field(default_factory=list)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class FieldMapping(BaseModel):
    source_column: str
    target_object_type: str
    target_property: str
    confidence: float = 0.0
    mapping_type: MappingType = MappingType.SUGGESTED
    reason: str = ""


class ObjectMapping(BaseModel):
    object_type: str
    id_column: str
    display_name_column: str = ""
    field_mappings: list[FieldMapping] = Field(default_factory=list)
    confidence: float = 0.0


class LinkMapping(BaseModel):
    link_type: str
    source_object_type: str
    source_id_column: str
    target_object_type: str
    target_id_column: str
    field_mappings: list[FieldMapping] = Field(default_factory=list)
    confidence: float = 0.0


class MappingSuggestion(BaseModel):
    source_column: str
    suggested_object_type: str
    suggested_property: str
    confidence: float
    reason: str
    mapping_type: MappingType = MappingType.SUGGESTED


class CandidateObject(BaseModel):
    id: str
    type: str
    properties: dict[str, Any] = Field(default_factory=dict)
    source_row: int = -1
    confidence: float = 1.0
    evidence: str = ""
    validation_issues: list[str] = Field(default_factory=list)


class CandidateLink(BaseModel):
    source_id: str
    target_id: str
    type: str
    properties: dict[str, Any] = Field(default_factory=dict)
    source_row: int = -1
    confidence: float = 1.0
    evidence: str = ""
    validation_issues: list[str] = Field(default_factory=list)


class ValidationSummary(BaseModel):
    total_objects: int = 0
    total_links: int = 0
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    info: list[str] = Field(default_factory=list)
    critical: list[str] = Field(default_factory=list)


class ImportPlanSummary(BaseModel):
    new_objects: int = 0
    updated_objects: int = 0
    new_links: int = 0
    validation_errors: int = 0
    validation_warnings: int = 0
    review_required: int = 0
    confidence_avg: float = 0.0


class ImportPlan(BaseModel):
    plan_id: str
    domain: str
    source_profile: DataSourceProfile | None = None
    object_mappings: list[ObjectMapping] = Field(default_factory=list)
    link_mappings: list[LinkMapping] = Field(default_factory=list)
    candidate_objects: list[CandidateObject] = Field(default_factory=list)
    candidate_links: list[CandidateLink] = Field(default_factory=list)
    validation_issues: list[dict[str, Any]] = Field(default_factory=list)
    summary: ImportPlanSummary = Field(default_factory=ImportPlanSummary)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status: PlanStatus = PlanStatus.DRAFT
    metadata: dict[str, Any] = Field(default_factory=dict)
    # Review linkage (set when submitted to review queue)
    submitted_to_review: bool = False
    review_batch_id: str = ""
    submitted_at: datetime | None = None

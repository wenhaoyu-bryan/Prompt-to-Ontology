"""Build Scenario and Build Plan models."""

from __future__ import annotations

from datetime import datetime, timezone
from pydantic import BaseModel, Field


class BuildScenarioDef(BaseModel):
    """Definition of a build scenario template."""
    id: str
    name: str
    description: str
    sources: list[str]  # CSV file names
    stages: list[BuildStageDef]


class BuildStageDef(BaseModel):
    """Definition of a single stage in a build scenario."""
    stage_id: str
    title: str
    description: str
    object_types: list[str] = []
    link_types: list[str] = []
    order: int


class BuildPlanSummary(BaseModel):
    sources: int = 0
    total_candidate_objects: int = 0
    total_candidate_links: int = 0
    total_validation_errors: int = 0
    total_validation_warnings: int = 0


class BuildPlanValidationSummary(BaseModel):
    cross_source_errors: list[str] = []
    cross_source_warnings: list[str] = []


class BuildPlanStage(BaseModel):
    stage_id: str
    title: str
    description: str
    order: int
    object_types: list[str] = []
    link_types: list[str] = []
    candidate_objects: list[dict] = []
    candidate_links: list[dict] = []
    validation_errors: list[str] = []
    validation_warnings: list[str] = []


class BuildPlan(BaseModel):
    id: str
    scenario_id: str
    name: str
    description: str
    status: str = "draft"  # draft | validated | submitted_to_review
    stages: list[BuildPlanStage] = []
    summary: BuildPlanSummary = BuildPlanSummary()
    validation: BuildPlanValidationSummary = BuildPlanValidationSummary()
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    submitted_to_review: bool = False
    review_batch_id: str | None = None

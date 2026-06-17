from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field

class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"

class RunStatus(str, Enum):
    NOT_STARTED = "not_started"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class ActionType(str, Enum):
    MANUAL = "manual"
    API = "api"
    NAVIGATION = "navigation"
    VALIDATION = "validation"

class ScenarioStep(BaseModel):
    step_id: str
    title: str
    title_zh: str = ""
    description: str = ""
    description_zh: str = ""
    route: str = ""
    action_type: ActionType = ActionType.MANUAL
    api_endpoint: str = ""
    expected_result: str = ""
    expected_result_zh: str = ""
    result_summary: str | None = None
    status: StepStatus = StepStatus.PENDING
    started_at: datetime | None = None
    completed_at: datetime | None = None

class ScenarioArtifacts(BaseModel):
    review_batch_id: str | None = None
    snapshot_id: str | None = None
    diff_id: str | None = None
    agent_trace_id: str | None = None
    evaluation_id: str | None = None

class ScenarioRun(BaseModel):
    run_id: str
    scenario_id: str
    title: str
    title_zh: str = ""
    description: str = ""
    description_zh: str = ""
    status: RunStatus = RunStatus.NOT_STARTED
    current_step_id: str = ""
    started_at: datetime | None = None
    completed_at: datetime | None = None
    steps: list[ScenarioStep] = Field(default_factory=list)
    artifacts: ScenarioArtifacts = Field(default_factory=ScenarioArtifacts)
    metadata: dict[str, Any] = Field(default_factory=dict)

class PredefinedScenario(BaseModel):
    scenario_id: str
    title: str
    title_zh: str = ""
    description: str = ""
    description_zh: str = ""
    estimated_minutes: int = 15
    step_count: int = 0

"""Demo admin models."""

from pydantic import BaseModel


class GraphInfo(BaseModel):
    node_count: int = 0
    relationship_count: int = 0


class ReviewQueueInfo(BaseModel):
    item_count: int = 0
    batch_count: int = 0
    pending_count: int = 0
    approved_count: int = 0
    applied_count: int = 0


class PipelineInfo(BaseModel):
    sample_sources_available: bool = True
    import_plan_count: int = 0


class AgentInfo(BaseModel):
    llm_configured: bool = False


class DemoState(BaseModel):
    mode: str = "unknown"  # "seeded" | "clean" | "unknown"
    graph: GraphInfo = GraphInfo()
    review_queue: ReviewQueueInfo = ReviewQueueInfo()
    pipeline: PipelineInfo = PipelineInfo()
    agent: AgentInfo = AgentInfo()
    last_reset_at: str | None = None
    warnings: list[str] = []


class DemoResetRequest(BaseModel):
    mode: str  # "seeded" | "clean"
    confirm: bool = False

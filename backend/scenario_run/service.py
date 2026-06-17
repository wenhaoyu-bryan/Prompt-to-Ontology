import uuid
from datetime import datetime, timezone
from .models import (
    StepStatus,
    RunStatus,
    ActionType,
    ScenarioStep,
    ScenarioRun,
    PredefinedScenario,
    ScenarioArtifacts,
)
from .storage import load_runs, save_runs


def _now():
    return datetime.now(timezone.utc)


def _new_id():
    return f"scenario-run-{uuid.uuid4().hex[:10]}"


# ---------------------------------------------------------------------------
# Predefined scenarios
# ---------------------------------------------------------------------------

GOLDEN_DEMO_STEPS = [
    ScenarioStep(
        step_id="reset_seeded_demo",
        title="Reset to Seeded Demo",
        title_zh="重置为预制演示",
        description="Reset the system to seeded demo mode with sample pet food data.",
        description_zh="将系统重置为预制演示模式，包含宠物食品样本数据。",
        route="/settings",
        action_type=ActionType.API,
        api_endpoint="/api/demo/reset",
        expected_result="Graph populated with 12 pet food products.",
        expected_result_zh="图谱已填充 12 个宠物食品产品。",
    ),
    ScenarioStep(
        step_id="confirm_graph",
        title="Confirm Graph Populated",
        title_zh="确认图谱已填充",
        description="Open Graph Explorer and verify nodes are visible.",
        description_zh="打开图谱浏览器，确认节点可见。",
        route="/graph",
        action_type=ActionType.VALIDATION,
        expected_result="Graph shows PetFoodProduct, Brand, Ingredient, RiskRule nodes.",
        expected_result_zh="图谱显示 PetFoodProduct、Brand、Ingredient、RiskRule 节点。",
    ),
    ScenarioStep(
        step_id="explore_objects",
        title="Explore Objects",
        title_zh="浏览对象",
        description="Open Object Explorer to inspect product details.",
        description_zh="打开对象浏览器，查看产品详情。",
        route="/objects",
        action_type=ActionType.NAVIGATION,
        expected_result="Can view product properties, ingredients, and linked rules.",
        expected_result_zh="可查看产品属性、成分和关联规则。",
    ),
    ScenarioStep(
        step_id="explore_graph",
        title="Explore Graph",
        title_zh="浏览图谱",
        description="Open Graph Explorer and click on nodes to see relationships.",
        description_zh="打开图谱浏览器，点击节点查看关系。",
        route="/graph",
        action_type=ActionType.NAVIGATION,
        expected_result="Can see CONTAINS, MADE_BY, TRIGGERS_RISK edges.",
        expected_result_zh="可看到 CONTAINS、MADE_BY、TRIGGERS_RISK 边。",
    ),
    ScenarioStep(
        step_id="inspect_rules",
        title="Inspect Rules in Rule Studio",
        title_zh="在规则工作室中检查规则",
        description="Open Rule Studio and review rule definitions and coverage.",
        description_zh="打开规则工作室，查看规则定义和覆盖情况。",
        route="/rule-studio",
        action_type=ActionType.NAVIGATION,
        expected_result="5 rules visible with trigger/passed/not_evaluable counts.",
        expected_result_zh="5 条规则可见，有触发/通过/无法评估计数。",
    ),
    ScenarioStep(
        step_id="ask_agent",
        title="Ask Agent: Feeding Recommendation",
        title_zh="询问 Agent：喂养推荐",
        description="Open Agent Operator and ask: 我应该喂我的猫吃什么？",
        description_zh="打开 Agent 操作器，询问：我应该喂我的猫吃什么？",
        route="/agent",
        action_type=ActionType.MANUAL,
        expected_result="Agent returns structured answer with product recommendations and data gaps.",
        expected_result_zh="Agent 返回结构化回答，包含产品推荐和数据缺口。",
    ),
    ScenarioStep(
        step_id="view_trace",
        title="View Agent Trace",
        title_zh="查看 Agent 追踪",
        description="Open Agent Traces and inspect the latest trace.",
        description_zh="打开 Agent 追踪，查看最新追踪记录。",
        route="/agent-traces",
        action_type=ActionType.NAVIGATION,
        expected_result="Trace shows tool calls, objects, rules, and evaluation scores.",
        expected_result_zh="追踪显示工具调用、对象、规则和评估分数。",
    ),
    ScenarioStep(
        step_id="generate_suggestions",
        title="Generate Data Quality Suggestions",
        title_zh="生成数据质量建议",
        description="Ask Agent: 当前数据里有哪些产品因为缺少字段导致无法完整评估？",
        description_zh="询问 Agent：当前数据里有哪些产品因为缺少字段导致无法完整评估？",
        route="/agent",
        action_type=ActionType.MANUAL,
        expected_result="Agent returns field-specific data quality suggestions.",
        expected_result_zh="Agent 返回字段级数据质量建议。",
    ),
    ScenarioStep(
        step_id="submit_review",
        title="Submit Suggestions to Review Queue",
        title_zh="提交建议到审核队列",
        description="Click Submit to Review in Agent Operator.",
        description_zh="在 Agent 操作器中点击提交到审核。",
        route="/agent",
        action_type=ActionType.MANUAL,
        expected_result="Suggestions appear in Review Queue with metadata.",
        expected_result_zh="建议出现在审核队列中，带有元数据。",
    ),
    ScenarioStep(
        step_id="approve_review",
        title="Approve Review Batch",
        title_zh="批准审核批次",
        description="Open Review Queue, review the batch, and approve.",
        description_zh="打开审核队列，审核批次并批准。",
        route="/review",
        action_type=ActionType.MANUAL,
        expected_result="Review batch approved and applied.",
        expected_result_zh="审核批次已批准并应用。",
    ),
    ScenarioStep(
        step_id="view_diff",
        title="View Graph Governance Diff",
        title_zh="查看图谱治理差异",
        description="Open Graph Governance and view the latest diff.",
        description_zh="打开图谱治理，查看最新差异。",
        route="/graph-governance",
        action_type=ActionType.NAVIGATION,
        expected_result="Graph diff shows changes from approved review.",
        expected_result_zh="图谱差异显示已批准审核的变更。",
    ),
    ScenarioStep(
        step_id="complete_demo",
        title="Complete Demo",
        title_zh="完成演示",
        description="Mark the demo as complete.",
        description_zh="标记演示完成。",
        action_type=ActionType.MANUAL,
        expected_result="Demo run status = completed.",
        expected_result_zh="演示运行状态 = 已完成。",
    ),
]

PREDEFINED_SCENARIOS = {
    "golden_demo_pet_food": PredefinedScenario(
        scenario_id="golden_demo_pet_food",
        title="Golden Demo: Pet Food Ontology Runtime",
        title_zh="Golden Demo：宠物食品本体运行时",
        description="End-to-end guided demo of the Pet Food Ontology platform.",
        description_zh="宠物食品本体平台的端到端引导演示。",
        estimated_minutes=15,
        step_count=len(GOLDEN_DEMO_STEPS),
    ),
}


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------


def list_predefined_scenarios() -> list[PredefinedScenario]:
    return list(PREDEFINED_SCENARIOS.values())


def create_run(scenario_id: str) -> ScenarioRun:
    predefined = PREDEFINED_SCENARIOS.get(scenario_id)
    if not predefined:
        raise ValueError(f"Unknown scenario: {scenario_id}")

    steps = []
    if scenario_id == "golden_demo_pet_food":
        steps = [s.model_copy(deep=True) for s in GOLDEN_DEMO_STEPS]

    run = ScenarioRun(
        run_id=_new_id(),
        scenario_id=scenario_id,
        title=predefined.title,
        title_zh=predefined.title_zh,
        description=predefined.description,
        description_zh=predefined.description_zh,
        status=RunStatus.NOT_STARTED,
        current_step_id=steps[0].step_id if steps else "",
        steps=steps,
    )
    runs = load_runs()
    runs.append(run)
    save_runs(runs)
    return run


def list_runs(limit: int = 20) -> list[ScenarioRun]:
    return load_runs()[-limit:]


def get_run(run_id: str) -> ScenarioRun | None:
    for r in load_runs():
        if r.run_id == run_id:
            return r
    return None


def _update_run(run: ScenarioRun):
    runs = load_runs()
    for i, r in enumerate(runs):
        if r.run_id == run.run_id:
            runs[i] = run
            break
    save_runs(runs)


def _find_step(run: ScenarioRun, step_id: str) -> ScenarioStep | None:
    for s in run.steps:
        if s.step_id == step_id:
            return s
    return None


def _advance_step(run: ScenarioRun):
    """Move current_step_id to the next pending step."""
    found_current = False
    for s in run.steps:
        if s.step_id == run.current_step_id:
            found_current = True
            continue
        if found_current and s.status == StepStatus.PENDING:
            run.current_step_id = s.step_id
            return
    # No more pending steps
    run.current_step_id = ""


def start_step(run_id: str, step_id: str) -> ScenarioRun:
    run = get_run(run_id)
    if not run:
        raise ValueError("Run not found")
    step = _find_step(run, step_id)
    if not step:
        raise ValueError("Step not found")

    step.status = StepStatus.RUNNING
    step.started_at = _now()
    if run.status == RunStatus.NOT_STARTED:
        run.status = RunStatus.RUNNING
        run.started_at = _now()
    run.current_step_id = step_id
    _update_run(run)
    return run


def complete_step(run_id: str, step_id: str, result_summary: str = "") -> ScenarioRun:
    run = get_run(run_id)
    if not run:
        raise ValueError("Run not found")
    step = _find_step(run, step_id)
    if not step:
        raise ValueError("Step not found")

    step.status = StepStatus.COMPLETED
    step.completed_at = _now()
    if result_summary:
        step.result_summary = result_summary
    _advance_step(run)
    _update_run(run)
    return run


def skip_step(run_id: str, step_id: str) -> ScenarioRun:
    run = get_run(run_id)
    if not run:
        raise ValueError("Run not found")
    step = _find_step(run, step_id)
    if not step:
        raise ValueError("Step not found")

    step.status = StepStatus.SKIPPED
    step.completed_at = _now()
    _advance_step(run)
    _update_run(run)
    return run


def attach_artifact(run_id: str, artifact_type: str, artifact_id: str) -> ScenarioRun:
    run = get_run(run_id)
    if not run:
        raise ValueError("Run not found")

    valid_types = {
        "review_batch_id",
        "snapshot_id",
        "diff_id",
        "agent_trace_id",
        "evaluation_id",
    }
    if artifact_type not in valid_types:
        raise ValueError(f"Invalid artifact type: {artifact_type}")

    setattr(run.artifacts, artifact_type, artifact_id)
    _update_run(run)
    return run


def complete_run(run_id: str) -> ScenarioRun:
    run = get_run(run_id)
    if not run:
        raise ValueError("Run not found")

    run.status = RunStatus.COMPLETED
    run.completed_at = _now()
    run.current_step_id = ""
    _update_run(run)
    return run


def get_demo_health() -> dict:
    """Check readiness of all demo components."""
    warnings = []
    health = {
        "graph_ready": False,
        "rule_studio_ready": False,
        "agent_trace_ready": False,
        "review_queue_ready": False,
        "snapshot_ready": False,
        "llm_configured": False,
        "warnings": warnings,
    }

    # Check graph
    try:
        from neo4j_connector import get_driver
        driver = get_driver()
        with driver.session() as session:
            count = session.run("MATCH (n) RETURN count(n) AS c").single()["c"]
            health["graph_ready"] = count > 0
            if count == 0:
                warnings.append("Graph is empty")
    except Exception:
        warnings.append("Neo4j not reachable")

    # Check rule studio
    try:
        from rule_engine import RuleEngine
        from ontology_registry import OntologyRegistry
        registry = OntologyRegistry("pet_food")
        engine = RuleEngine(registry)
        health["rule_studio_ready"] = True
    except Exception:
        warnings.append("Rule engine not ready")

    # Check agent trace storage
    try:
        from agent_trace.storage import load_traces
        load_traces()
        health["agent_trace_ready"] = True
    except Exception:
        warnings.append("Agent trace storage not ready")

    # Check review queue
    try:
        from review_queue.storage import load_items
        load_items()
        health["review_queue_ready"] = True
    except Exception:
        warnings.append("Review queue storage not ready")

    # Check snapshots
    try:
        from graph_snapshot.storage import load_snapshots
        load_snapshots()
        health["snapshot_ready"] = True
    except Exception:
        warnings.append("Snapshot storage not ready")

    # Check LLM config
    try:
        import os
        from pathlib import Path
        env_path = Path(__file__).parent.parent / ".env"
        has_env_key = False
        if env_path.exists():
            content = env_path.read_text()
            has_env_key = "LLM_API_KEY" in content and "your-" not in content
        has_runtime = False
        runtime_path = Path(__file__).parent.parent / ".runtime" / "llm_config.json"
        if runtime_path.exists():
            import json
            cfg = json.loads(runtime_path.read_text())
            has_runtime = bool(cfg.get("api_key"))
        health["llm_configured"] = has_env_key or has_runtime
        if not health["llm_configured"]:
            warnings.append("LLM not configured (optional)")
    except Exception:
        warnings.append("LLM config check failed")

    return health

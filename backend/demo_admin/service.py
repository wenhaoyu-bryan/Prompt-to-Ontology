"""Demo admin service — inspect state, reset, seed, clear."""

import os
from datetime import datetime, timezone

from .models import DemoState, GraphInfo, ReviewQueueInfo, PipelineInfo, AgentInfo


class DemoAdminService:

    def __init__(self, driver, pipeline_service=None, llm_config_manager=None):
        self.driver = driver
        self.pipeline_service = pipeline_service
        self.llm_config_manager = llm_config_manager

    # ---------- safety guard ----------

    @staticmethod
    def is_enabled() -> bool:
        return os.environ.get("DEMO_ADMIN_ENABLED", "true").lower() == "true"

    # ---------- state ----------

    def get_state(self) -> DemoState:
        graph = self._get_graph_info()
        review = self._get_review_info()
        pipeline = self._get_pipeline_info()
        agent = self._get_agent_info()

        mode = self._detect_mode(graph)
        warnings = []
        if graph.node_count == 0:
            warnings.append("Graph is empty. Use Data Pipeline or reset to Seeded Demo Mode.")

        return DemoState(
            mode=mode,
            graph=graph,
            review_queue=review,
            pipeline=pipeline,
            agent=agent,
            warnings=warnings,
        )

    # ---------- reset ----------

    def reset(self, mode: str) -> DemoState:
        if mode not in ("seeded", "clean"):
            raise ValueError(f"Invalid mode: {mode}. Must be 'seeded' or 'clean'.")

        self._clear_graph()
        self._clear_review_queue()
        self._clear_pipeline()

        if mode == "seeded":
            self._seed_pet_food()

        return self.get_state()

    # ---------- seed ----------

    def seed(self) -> DemoState:
        self._seed_pet_food()
        return self.get_state()

    # ---------- clear ----------

    def clear(self) -> DemoState:
        self._clear_graph()
        self._clear_review_queue()
        self._clear_pipeline()
        return self.get_state()

    # ---------- internal helpers ----------

    def _get_graph_info(self) -> GraphInfo:
        try:
            with self.driver.session() as session:
                nodes = session.run("MATCH (n) RETURN count(n) AS c").single()["c"]
                rels = session.run("MATCH ()-[r]->() RETURN count(r) AS c").single()["c"]
            return GraphInfo(node_count=nodes, relationship_count=rels)
        except Exception:
            return GraphInfo()

    def _get_review_info(self) -> ReviewQueueInfo:
        try:
            from review_queue.storage import load_items, load_batches
            items = load_items()
            batches = load_batches()
            pending = sum(1 for i in items if i.status == "pending")
            approved = sum(1 for i in items if i.status == "approved")
            applied = sum(1 for i in items if i.status == "applied")
            return ReviewQueueInfo(
                item_count=len(items),
                batch_count=len(batches),
                pending_count=pending,
                approved_count=approved,
                applied_count=applied,
            )
        except Exception:
            return ReviewQueueInfo()

    def _get_pipeline_info(self) -> PipelineInfo:
        try:
            from pathlib import Path
            sample_dir = Path(__file__).resolve().parent.parent.parent / "sample-data" / "pet-food"
            available = sample_dir.exists()
            plan_count = 0
            if self.pipeline_service:
                plan_count = len(self.pipeline_service.list_import_plans())
            return PipelineInfo(sample_sources_available=available, import_plan_count=plan_count)
        except Exception:
            return PipelineInfo()

    def _get_agent_info(self) -> AgentInfo:
        try:
            if self.llm_config_manager:
                cfg = self.llm_config_manager.get_config()
                configured = cfg is not None and cfg.get("api_key") is not None
                return AgentInfo(llm_configured=configured)
            return AgentInfo()
        except Exception:
            return AgentInfo()

    @staticmethod
    def _detect_mode(graph: GraphInfo) -> str:
        if graph.node_count > 0:
            return "seeded"
        return "clean"

    def _clear_graph(self):
        with self.driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")

    @staticmethod
    def _clear_review_queue():
        from review_queue.storage import save_items, save_batches
        save_items([])
        save_batches([])

    def _clear_pipeline(self):
        if self.pipeline_service:
            self.pipeline_service._plans.clear()
            self.pipeline_service._profiles.clear()
            self.pipeline_service._rows.clear()
            self.pipeline_service._save_plans_to_disk()

    def _seed_pet_food(self):
        from pathlib import Path
        from domain.petfood_transformer import transform
        from rule_engine import RuleEngine
        from constraint_validator import validate_payload
        from petfood_neo4j import ensure_constraints, write_graph_payload
        from ontology_registry import OntologyRegistry
        from ontology import build_graph
        from domain_config import get_default_domain, get_domain_config

        sample_dir = Path(__file__).resolve().parent.parent.parent / "sample-data" / "pet-food"
        if not sample_dir.exists():
            return

        ensure_constraints(self.driver)
        payload = transform(sample_dir)
        registry = OntologyRegistry("pet_food")
        engine = RuleEngine(registry)
        payload = engine.apply_rules(payload)

        vr = validate_payload(registry, payload)
        if not vr["valid"]:
            return

        write_graph_payload(payload, self.driver)

        domain = get_default_domain()
        config = get_domain_config(domain)
        build_graph(config["dataset"])

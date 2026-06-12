"""Pipeline Service — with JSON persistence for import plans.

Phase 28: in-memory storage.
Phase 29.6: JSON persistence under backend/.runtime/import_plans.json.
"""

from __future__ import annotations

import csv
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from ontology_kernel import load_ontology_schema, load_pet_food_schema
from ontology_kernel.models import OntologySchema

from .import_plan import create_import_plan
from .mapper import suggest_field_mappings, suggest_object_mappings
from .models import DataSourceProfile, ImportPlan, MappingSuggestion, ObjectMapping, FieldMapping, LinkMapping
from .profiler import profile_csv, profile_rows

# Sample data paths
_SAMPLE_DIR = Path(__file__).resolve().parent.parent.parent / "sample-data" / "pet-food"

_SAMPLE_FILES: dict[str, str] = {
    "pet_food_products": str(_SAMPLE_DIR / "pet_food_products.csv"),
    "pet_food_ingredients": str(_SAMPLE_DIR / "pet_food_ingredients.csv"),
    "product_ingredients": str(_SAMPLE_DIR / "product_ingredients.csv"),
    "risk_rules": str(_SAMPLE_DIR / "risk_rules.csv"),
}

# Known link mappings for sample data
_SAMPLE_LINK_MAPPINGS: dict[str, list[dict]] = {
    "product_ingredients": [
        {
            "link_type": "CONTAINS",
            "source_object_type": "PetFoodProduct",
            "source_id_column": "product_id",
            "target_object_type": "Ingredient",
            "target_id_column": "ingredient_id",
        }
    ],
}

# Persistence path
_RUNTIME_DIR = Path(__file__).resolve().parent.parent / ".runtime"
_PLANS_FILE = _RUNTIME_DIR / "import_plans.json"


class PipelineService:
    """Pipeline service with JSON persistence for import plans."""

    def __init__(self):
        self._profiles: dict[str, DataSourceProfile] = {}
        self._plans: dict[str, ImportPlan] = {}
        self._rows: dict[str, list[dict[str, Any]]] = {}
        self._load_plans_from_disk()

    # ── Persistence ────────────────────────────────────────────────────

    def _load_plans_from_disk(self):
        """Load persisted import plans from JSON."""
        if not _PLANS_FILE.exists():
            return
        try:
            with open(_PLANS_FILE, "r", encoding="utf-8") as f:
                raw = json.load(f)
            for plan_data in raw:
                plan = ImportPlan(**plan_data)
                self._plans[plan.plan_id] = plan
        except (json.JSONDecodeError, Exception):
            pass

    def _save_plans_to_disk(self):
        """Persist import plans to JSON."""
        _RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        with open(_PLANS_FILE, "w", encoding="utf-8") as f:
            json.dump(
                [p.model_dump(mode="json") for p in self._plans.values()],
                f, ensure_ascii=False, indent=2,
            )

    def reset_runtime(self) -> None:
        """Clear all in-memory profiles, plans, rows, and persisted plans."""
        self._profiles.clear()
        self._plans.clear()
        self._rows.clear()
        self._save_plans_to_disk()

    # ── Sample sources ─────────────────────────────────────────────────

    def list_sample_sources(self) -> list[dict[str, str]]:
        """List available built-in sample data sources."""
        return [
            {"name": name, "path": path, "exists": Path(path).exists()}
            for name, path in _SAMPLE_FILES.items()
        ]

    # ── Profiling ──────────────────────────────────────────────────────

    def profile_sample(self, sample_name: str) -> DataSourceProfile:
        """Profile a built-in sample data source."""
        if sample_name not in _SAMPLE_FILES:
            raise ValueError(f"Unknown sample: {sample_name}. Available: {list(_SAMPLE_FILES.keys())}")

        path = _SAMPLE_FILES[sample_name]
        if not Path(path).exists():
            raise FileNotFoundError(f"Sample file not found: {path}")

        profile = profile_csv(path, sample_name)
        self._profiles[profile.source_id] = profile

        # Cache rows
        with open(path, "r", encoding="utf-8-sig") as f:
            self._rows[sample_name] = list(csv.DictReader(f))

        return profile

    def profile_csv_content(self, filename: str, content: str) -> DataSourceProfile:
        """Profile CSV content from a string."""
        from .profiler import profile_csv_content as _profile_content
        profile = _profile_content(content, filename)
        profile.source_type = "custom_csv"
        self._profiles[profile.source_id] = profile

        import io
        self._rows[filename] = list(csv.DictReader(io.StringIO(content)))

        return profile

    def get_profile(self, source_id: str) -> DataSourceProfile | None:
        return self._profiles.get(source_id)

    # ── Mapping suggestions ────────────────────────────────────────────

    def suggest_mappings(self, source_id: str, domain: str = "pet_food") -> dict[str, Any]:
        """Suggest field mappings for a profiled source."""
        profile = self._profiles.get(source_id)
        if not profile:
            raise ValueError(f"Profile not found: {source_id}")

        schema = self._load_schema(domain)

        field_suggestions = suggest_field_mappings(profile, schema)
        object_mappings, unmapped = suggest_object_mappings(profile, schema)

        return {
            "source_id": source_id,
            "domain": domain,
            "field_suggestions": [s.model_dump() for s in field_suggestions],
            "object_mappings": [m.model_dump() for m in object_mappings],
            "unmapped_fields": [f.model_dump() for f in unmapped],
        }

    # ── Import plan ────────────────────────────────────────────────────

    def create_import_plan(
        self,
        source_id: str,
        domain: str = "pet_food",
        object_mappings: list[dict] | None = None,
        link_mappings: list[dict] | None = None,
    ) -> ImportPlan:
        """Create an import plan from a profiled source."""
        profile = self._profiles.get(source_id)
        if not profile:
            raise ValueError(f"Profile not found: {source_id}")

        rows = self._rows.get(source_id, [])
        schema = self._load_schema(domain)

        # Use provided mappings or auto-suggest
        if object_mappings:
            obj_maps = [ObjectMapping(**m) for m in object_mappings]
        else:
            obj_maps, _ = suggest_object_mappings(profile, schema)

        lnk_maps = []
        if link_mappings:
            lnk_maps = [LinkMapping(**m) for m in link_mappings]
        elif source_id in _SAMPLE_LINK_MAPPINGS:
            lnk_maps = [LinkMapping(**m, confidence=1.0) for m in _SAMPLE_LINK_MAPPINGS[source_id]]

        plan = create_import_plan(
            domain=domain,
            profile=profile,
            rows=rows,
            object_mappings=obj_maps,
            link_mappings=lnk_maps,
            schema=schema,
        )

        # Add source metadata for custom CSV uploads
        if profile.source_type == "custom_csv":
            plan.metadata["source_type"] = "custom_csv"
            plan.metadata["filename"] = profile.source_name
            plan.metadata["uploaded_at"] = profile.created_at.isoformat() if profile.created_at else ""

        self._plans[plan.plan_id] = plan
        self._save_plans_to_disk()
        return plan

    def get_import_plan(self, plan_id: str) -> ImportPlan | None:
        return self._plans.get(plan_id)

    def list_import_plans(self) -> list[ImportPlan]:
        return sorted(self._plans.values(), key=lambda p: p.created_at, reverse=True)

    def mark_plan_submitted_to_review(self, plan_id: str, batch_id: str) -> ImportPlan | None:
        """Mark an import plan as submitted to review queue."""
        plan = self._plans.get(plan_id)
        if not plan:
            return None
        plan.submitted_to_review = True
        plan.review_batch_id = batch_id
        plan.submitted_at = datetime.utcnow()
        self._save_plans_to_disk()
        return plan

    # ── Internal ───────────────────────────────────────────────────────

    def _load_schema(self, domain: str) -> OntologySchema:
        if domain == "pet_food":
            return load_pet_food_schema()
        base = Path(__file__).resolve().parent.parent.parent / "ontology" / domain
        return load_ontology_schema(domain, str(base))

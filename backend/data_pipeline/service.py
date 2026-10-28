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
from .models import CandidateLink, DataSourceProfile, ImportPlan, ImportPlanSummary, MappingSuggestion, ObjectMapping, FieldMapping, LinkMapping, MappingType, PlanStatus
from .profiler import profile_csv, profile_rows
from .source_catalog import SourceCatalog

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
_SOURCES_FILE = _RUNTIME_DIR / "source_catalog.json"


class PipelineService:
    """Pipeline service with JSON persistence for import plans."""

    def __init__(self):
        self._profiles: dict[str, DataSourceProfile] = {}
        self._plans: dict[str, ImportPlan] = {}
        self._rows: dict[str, list[dict[str, Any]]] = {}
        self.source_catalog = SourceCatalog(_SOURCES_FILE)
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
        self.source_catalog.reset()
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
        profile.source_type = "sample"
        revision = self.source_catalog.register(sample_name, "sample", Path(path).read_bytes(), [c.name for c in profile.columns])
        profile.source_asset_id = revision["asset_id"]
        profile.source_revision_id = revision["revision_id"]
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
        revision = self.source_catalog.register(filename, "custom_csv", content.encode("utf-8"), [c.name for c in profile.columns])
        profile.source_asset_id = revision["asset_id"]
        profile.source_revision_id = revision["revision_id"]
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

        revision = self.source_catalog.source(profile.source_revision_id)
        fields_by_name = {f["source_column"]: f for f in revision["fields"]}
        enriched_suggestions = []
        for suggestion in field_suggestions:
            field = fields_by_name[suggestion.source_column]
            mapping = self.source_catalog.propose(
                profile.source_revision_id, field["field_id"],
                suggestion.suggested_object_type, suggestion.suggested_property,
                suggestion.confidence,
            )
            enriched_suggestions.append({**suggestion.model_dump(), "source_field_id": field["field_id"],
                                         "mapping_status": mapping["status"], "resolution": mapping["resolution"],
                                         "recorded_mapping": mapping})

        return {
            "source_id": source_id,
            "source_asset_id": profile.source_asset_id,
            "source_revision_id": profile.source_revision_id,
            "domain": domain,
            "field_suggestions": enriched_suggestions,
            "object_mappings": [m.model_dump() for m in object_mappings],
            "unmapped_fields": [f.model_dump() for f in unmapped],
        }

    def decide_mapping(self, revision_id: str, field_id: str, object_type: str,
                       property_name: str, resolution: str, domain: str = "pet_food") -> dict:
        """Confirm or separate a source field after checking the ontology target."""
        if resolution != "separate":
            schema = self._load_schema(domain)
            obj = schema.object_types.get(object_type)
            if obj is None or property_name not in {p.name for p in obj.properties}:
                raise ValueError(f"Unknown ontology property: {object_type}.{property_name}")
        return self.source_catalog.decide(revision_id, field_id, object_type, property_name, resolution)

    def _apply_source_decisions(self, profile: DataSourceProfile, mappings: list[ObjectMapping], schema: OntologySchema) -> list[ObjectMapping]:
        """Honor confirmed mappings and exclusions when producing a plan."""
        fields = self.source_catalog.source(profile.source_revision_id)["fields"]
        decisions = {f["source_column"]: f["mapping"] for f in fields if f["mapping"] and f["mapping"]["status"] != "suggested"}
        if not decisions:
            return mappings

        grouped: dict[str, list[FieldMapping]] = {}
        present_columns: set[str] = set()
        fallback_ids = {m.object_type: m.id_column for m in mappings}
        for object_mapping in mappings:
            for field in object_mapping.field_mappings:
                present_columns.add(field.source_column)
                decision = decisions.get(field.source_column)
                if decision and decision["status"] == "separate":
                    continue
                if decision and decision["status"] == "confirmed":
                    field = field.model_copy(update={
                        "target_object_type": decision["target_object_type"],
                        "target_property": decision["target_property"],
                        "confidence": 1.0,
                        "mapping_type": MappingType.MANUAL,
                        "reason": f"confirmed source mapping ({decision['resolution']})",
                    })
                grouped.setdefault(field.target_object_type, []).append(field)

        for source_column, decision in decisions.items():
            if source_column in present_columns or decision["status"] != "confirmed":
                continue
            grouped.setdefault(decision["target_object_type"], []).append(FieldMapping(
                source_column=source_column,
                target_object_type=decision["target_object_type"],
                target_property=decision["target_property"],
                confidence=1.0, mapping_type=MappingType.MANUAL,
                reason=f"confirmed source mapping ({decision['resolution']})",
            ))

        result = []
        for object_type, fields_for_type in grouped.items():
            type_def = schema.object_types.get(object_type)
            if type_def is None:
                raise ValueError(f"Unknown object type in mapping decision: {object_type}")
            id_column = next((f.source_column for f in fields_for_type if f.target_property == type_def.primary_key), "")
            if not id_column:
                fallback = fallback_ids.get(object_type)
                id_column = fallback if fallback in {f.source_column for f in fields_for_type} else fields_for_type[0].source_column
            display_column = next((f.source_column for f in fields_for_type if "name" in f.target_property.lower()), id_column)
            result.append(ObjectMapping(
                object_type=object_type, id_column=id_column, display_name_column=display_column,
                field_mappings=fields_for_type,
                confidence=sum(f.confidence for f in fields_for_type) / len(fields_for_type),
            ))
        return result

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
        if object_mappings is not None:
            obj_maps = [ObjectMapping(**m) for m in object_mappings]
        else:
            obj_maps, _ = suggest_object_mappings(profile, schema)
        obj_maps = self._apply_source_decisions(profile, obj_maps, schema)

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

        plan.metadata["source_asset_id"] = profile.source_asset_id
        plan.metadata["source_revision_id"] = profile.source_revision_id
        plan.metadata["mapping_decisions"] = [
            f["mapping"] for f in self.source_catalog.source(profile.source_revision_id)["fields"]
            if f["mapping"] is not None
        ]

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

    def create_relationship_import_plan(
        self,
        source_id: str,
        domain: str,
        link_type: str,
        source_id_column: str,
        target_id_column: str,
        source_object_type: str = "",
        target_object_type: str = "",
        property_columns: list[str] | None = None,
    ) -> ImportPlan:
        """Create an import plan for a relationship CSV upload.

        Generates candidate links from CSV rows, validates endpoints against Neo4j,
        and creates an Import Plan with only candidate_links (no candidate_objects).
        """
        profile = self._profiles.get(source_id)
        if not profile:
            raise ValueError(f"Profile not found: {source_id}")

        rows = self._rows.get(source_id, [])
        schema = self._load_schema(domain)
        plan_id = f"plan-{uuid.uuid4().hex[:8]}"

        # Resolve source/target types from schema if not provided
        lt_def = schema.link_types.get(link_type)
        if lt_def:
            if not source_object_type:
                source_object_type = lt_def.source_type
            if not target_object_type:
                target_object_type = lt_def.target_type

        # Generate candidate links from rows
        prop_cols = property_columns or []
        candidate_links: list[CandidateLink] = []
        validation_issues: list[dict[str, Any]] = []
        seen_links: set[tuple[str, str, str]] = set()

        for row_idx, row in enumerate(rows):
            src_id = str(row.get(source_id_column, "")).strip()
            tgt_id = str(row.get(target_id_column, "")).strip()

            if not src_id:
                validation_issues.append({
                    "level": "error", "code": "MISSING_SOURCE_ID",
                    "message": f"Row {row_idx}: source ID column '{source_id_column}' is empty",
                    "object_id": "", "link_id": "", "field": source_id_column,
                })
                continue
            if not tgt_id:
                validation_issues.append({
                    "level": "error", "code": "MISSING_TARGET_ID",
                    "message": f"Row {row_idx}: target ID column '{target_id_column}' is empty",
                    "object_id": "", "link_id": "", "field": target_id_column,
                })
                continue

            # Collect optional properties
            props: dict[str, Any] = {}
            for col in prop_cols:
                val = row.get(col)
                if val is not None and str(val).strip():
                    props[col] = val

            # Duplicate check
            link_key = (src_id, tgt_id, link_type)
            if link_key in seen_links:
                validation_issues.append({
                    "level": "warning", "code": "DUPLICATE_RELATIONSHIP",
                    "message": f"Row {row_idx}: duplicate {link_type} from {src_id} to {tgt_id}",
                    "object_id": src_id, "link_id": f"{src_id}-[{link_type}]->{tgt_id}", "field": "",
                })
                continue
            seen_links.add(link_key)

            candidate_links.append(CandidateLink(
                source_id=src_id,
                target_id=tgt_id,
                type=link_type,
                properties=props,
                source_row=row_idx,
                confidence=1.0,
            ))

        # Validate endpoints against Neo4j
        endpoint_errors = 0
        try:
            from neo4j_connector import get_driver
            drv = get_driver()
            with drv.session() as session:
                for cl in candidate_links:
                    check = session.run(
                        "MATCH (a {id: $sid}), (b {id: $tid}) RETURN labels(a) AS a_labels, labels(b) AS b_labels",
                        sid=cl.source_id, tid=cl.target_id,
                    ).single()
                    if not check:
                        validation_issues.append({
                            "level": "error", "code": "MISSING_ENDPOINT",
                            "message": f"Source ({cl.source_id}) or target ({cl.target_id}) node not found in graph",
                            "object_id": cl.source_id, "link_id": "", "field": "",
                        })
                        endpoint_errors += 1
                    else:
                        a_labels = check["a_labels"] or []
                        b_labels = check["b_labels"] or []
                        if source_object_type and source_object_type not in a_labels:
                            validation_issues.append({
                                "level": "error", "code": "WRONG_SOURCE_TYPE",
                                "message": f"Source {cl.source_id} has labels {a_labels}, expected {source_object_type}",
                                "object_id": cl.source_id, "link_id": "", "field": "",
                            })
                            endpoint_errors += 1
                        if target_object_type and target_object_type not in b_labels:
                            validation_issues.append({
                                "level": "error", "code": "WRONG_TARGET_TYPE",
                                "message": f"Target {cl.target_id} has labels {b_labels}, expected {target_object_type}",
                                "object_id": cl.target_id, "link_id": "", "field": "",
                            })
                            endpoint_errors += 1
        except Exception as e:
            validation_issues.append({
                "level": "warning", "code": "ENDPOINT_CHECK_FAILED",
                "message": f"Could not validate endpoints: {e}",
                "object_id": "", "link_id": "", "field": "",
            })

        # Determine status
        has_error = any(i["level"] in ("critical", "error") for i in validation_issues)
        has_warning = any(i["level"] == "warning" for i in validation_issues)

        if has_error:
            status = PlanStatus.HAS_ERRORS
        elif has_warning:
            status = PlanStatus.READY_FOR_REVIEW
        elif candidate_links:
            status = PlanStatus.VALIDATED
        else:
            status = PlanStatus.DRAFT

        # Build summary
        confidences = [cl.confidence for cl in candidate_links]
        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
        summary = ImportPlanSummary(
            new_links=len(candidate_links),
            validation_errors=sum(1 for i in validation_issues if i["level"] in ("error", "critical")),
            validation_warnings=sum(1 for i in validation_issues if i["level"] == "warning"),
            confidence_avg=round(avg_conf, 3),
        )

        plan = ImportPlan(
            plan_id=plan_id,
            domain=domain,
            source_profile=profile,
            candidate_links=candidate_links,
            validation_issues=validation_issues,
            summary=summary,
            status=status,
            metadata={
                "source_type": "custom_csv",
                "import_type": "relationship",
                "filename": profile.source_name,
                "link_type": link_type,
                "source_object_type": source_object_type,
                "target_object_type": target_object_type,
                "uploaded_at": profile.created_at.isoformat() if profile.created_at else "",
            },
        )

        self._plans[plan.plan_id] = plan
        self._save_plans_to_disk()
        return plan

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

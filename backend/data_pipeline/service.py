"""Manual pipeline service for persisted source revisions and import plans."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import Any

from ontology_kernel import load_ontology_schema, load_pet_food_schema
from ontology_kernel.models import OntologySchema

from .import_plan import create_import_plan
from .mapper import suggest_field_mappings, suggest_object_mappings
from .models import CandidateLink, DataSourceProfile, ImportPlan, ImportPlanSummary, ObjectMapping, FieldMapping, LinkMapping, MappingType, PlanStatus
from .persistence import atomic_json
from .profiler import parse_csv_rows, parse_structured_rows, profile_rows
from .source_catalog import SourceCatalog
from .transformer import mapped_link_property, row_id

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
_LOCK = RLock()


class PipelineService:
    """Pipeline service with local persistence for a single app process."""

    def __init__(self):
        self._profiles: dict[str, DataSourceProfile] = {}
        self._rows: dict[str, list[dict[str, Any]]] = {}
        self._plans_file = _PLANS_FILE
        self.source_catalog = SourceCatalog(_SOURCES_FILE)

    # ── Persistence ────────────────────────────────────────────────────

    def _load_plans_from_disk(self) -> dict[str, ImportPlan]:
        if not self._plans_file.exists():
            return {}
        plans = (ImportPlan.model_validate(value) for value in json.loads(self._plans_file.read_text(encoding="utf-8")))
        return {plan.plan_id: plan for plan in plans}

    def _save_plans_to_disk(self, plans: dict[str, ImportPlan]) -> None:
        atomic_json(self._plans_file, [p.model_dump(mode="json") for p in plans.values()])

    def _persist_plan(self, plan: ImportPlan) -> None:
        with _LOCK:
            plans = self._load_plans_from_disk()
            plans[plan.plan_id] = plan
            self._save_plans_to_disk(plans)

    def reset_runtime(self) -> None:
        """Clear profiles, rows, plans, and their persisted data."""
        with _LOCK:
            self._profiles.clear()
            self._rows.clear()
            self.source_catalog.reset()
            self._save_plans_to_disk({})

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

        return self._profile_source(sample_name, "sample", Path(path).read_bytes())

    def profile_csv_content(self, filename: str, content: str) -> DataSourceProfile:
        """Profile CSV content from a string."""
        return self._profile_source(filename, "custom_csv", content.encode("utf-8"))

    def profile_structured_content(self, filename: str, content: str, fmt: str) -> DataSourceProfile:
        """Register JSON/NDJSON revisions for the same mapping and import path."""
        if fmt not in {"json", "ndjson"}:
            raise ValueError("Unsupported structured format")
        return self._profile_source(filename, f"custom_{fmt}", content.encode("utf-8"))

    def _profile_source(
        self, name: str, source_type: str, content: bytes, revision: dict | None = None,
    ) -> DataSourceProfile:
        text = content.decode("utf-8-sig")
        rows = (parse_csv_rows(text) if source_type in {"sample", "custom_csv"}
                else parse_structured_rows(text, source_type.removeprefix("custom_")))
        profile = profile_rows(rows, name)
        with _LOCK:
            if revision is None:
                revision = self.source_catalog.register(name, source_type, content, [c.name for c in profile.columns])
            profile.source_type = source_type
            profile.source_asset_id = revision["asset_id"]
            profile.source_revision_id = revision["revision_id"]
            profile.created_at = datetime.fromisoformat(revision["created_at"])
            if source_type != "sample":
                profile.source_id = profile.source_revision_id
            self._profiles[profile.source_id] = profile
            self._rows[profile.source_id] = rows
        return profile

    def get_profile(self, source_id: str) -> DataSourceProfile | None:
        with _LOCK:
            profile = self._profiles.get(source_id)
            if profile is not None:
                return profile
            upload = self.source_catalog.load_content(source_id)
            if upload is None:
                return None
            revision, content = upload
            return self._profile_source(revision["source_name"], revision["source_type"], content, revision)

    def _get_profile_and_rows(self, source_id: str) -> tuple[DataSourceProfile, list[dict[str, Any]]]:
        with _LOCK:
            profile = self.get_profile(source_id)
            if profile is None:
                raise ValueError(f"Profile not found: {source_id}")
            return profile, self._rows[source_id]

    # ── Mapping suggestions ────────────────────────────────────────────

    def suggest_mappings(self, source_id: str, domain: str = "pet_food") -> dict[str, Any]:
        """Suggest field mappings for a profiled source."""
        profile = self.get_profile(source_id)
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

    def _apply_source_decisions(self, fields: list[dict], mappings: list[ObjectMapping], schema: OntologySchema) -> list[ObjectMapping]:
        """Honor confirmed mappings and exclusions when producing a plan."""
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
        unit_confirmations: dict[str, str] | None = None,
    ) -> ImportPlan:
        """Create an import plan from a profiled source."""
        profile, rows = self._get_profile_and_rows(source_id)
        schema = self._load_schema(domain)

        # Use provided mappings or auto-suggest
        if object_mappings is not None:
            obj_maps = [ObjectMapping(**m) for m in object_mappings]
        else:
            obj_maps, _ = suggest_object_mappings(profile, schema)
        source_fields = self.source_catalog.source(profile.source_revision_id)["fields"]
        obj_maps = self._apply_source_decisions(source_fields, obj_maps, schema)

        columns = {column.name for column in profile.columns}
        if unit_confirmations is not None and (
            not isinstance(unit_confirmations, dict)
            or any(column not in columns or unit != "per_100g" for column, unit in unit_confirmations.items())
        ):
            raise ValueError("Unit confirmations must name source columns and use per_100g")

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
            unit_confirmations=unit_confirmations,
        )

        plan.metadata["source_asset_id"] = profile.source_asset_id
        plan.metadata["source_revision_id"] = profile.source_revision_id
        plan.metadata["mapping_decisions"] = [
            field["mapping"] for field in source_fields if field["mapping"] is not None
        ]
        if unit_confirmations:
            plan.metadata["unit_confirmations"] = unit_confirmations

        # Preserve the uploaded format through the same reviewable plan path.
        if profile.source_type.startswith("custom_"):
            plan.metadata["source_type"] = profile.source_type
            plan.metadata["filename"] = profile.source_name
            plan.metadata["uploaded_at"] = profile.created_at.isoformat() if profile.created_at else ""

        self._persist_plan(plan)
        return plan

    def get_import_plan(self, plan_id: str) -> ImportPlan | None:
        return self._load_plans_from_disk().get(plan_id)

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
        profile, rows = self._get_profile_and_rows(source_id)
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
            src_id = row_id(row, source_id_column)
            tgt_id = row_id(row, target_id_column)

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
                if val is None or not str(val).strip():
                    continue
                val = mapped_link_property(link_type, col, col, val, row_idx, src_id, tgt_id, validation_issues)
                if val is not None:
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
                "source_type": profile.source_type,
                "import_type": "relationship",
                "source_asset_id": profile.source_asset_id,
                "source_revision_id": profile.source_revision_id,
                "filename": profile.source_name,
                "link_type": link_type,
                "source_object_type": source_object_type,
                "target_object_type": target_object_type,
                "uploaded_at": profile.created_at.isoformat() if profile.created_at else "",
            },
        )

        self._persist_plan(plan)
        return plan

    def list_import_plans(self) -> list[ImportPlan]:
        return sorted(self._load_plans_from_disk().values(), key=lambda p: p.created_at, reverse=True)

    def mark_plan_submitted_to_review(self, plan_id: str, batch_id: str) -> ImportPlan | None:
        """Mark an import plan as submitted to review queue."""
        with _LOCK:
            plans = self._load_plans_from_disk()
            plan = plans.get(plan_id)
            if not plan:
                return None
            plan.submitted_to_review = True
            plan.review_batch_id = batch_id
            plan.submitted_at = datetime.utcnow()
            self._save_plans_to_disk(plans)
            return plan

    # ── Internal ───────────────────────────────────────────────────────

    def _load_schema(self, domain: str) -> OntologySchema:
        if domain == "pet_food":
            return load_pet_food_schema()
        base = Path(__file__).resolve().parent.parent.parent / "ontology" / domain
        return load_ontology_schema(domain, str(base))

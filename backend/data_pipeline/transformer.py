"""Transformer — generates candidate objects and links from mapped rows."""

from __future__ import annotations

from typing import Any

from ontology_kernel.models import EvidenceMetadata, OntologySchema

from .models import (
    CandidateLink,
    CandidateObject,
    FieldMapping,
    LinkMapping,
    ObjectMapping,
)


def generate_candidate_objects(
    rows: list[dict[str, Any]],
    object_mapping: ObjectMapping,
    schema: OntologySchema,
) -> list[CandidateObject]:
    """Generate candidate ontology objects from rows using an object mapping."""
    candidates = []
    type_def = schema.object_types.get(object_mapping.object_type)

    for i, row in enumerate(rows):
        props = {}
        obj_id = ""

        for fm in object_mapping.field_mappings:
            value = row.get(fm.source_column)
            if value is not None and str(value).strip() != "":
                props[fm.target_property] = value

        # Determine ID
        if object_mapping.id_column:
            obj_id = str(row.get(object_mapping.id_column, ""))
        if type_def and type_def.primary_key:
            obj_id = str(props.get(type_def.primary_key, obj_id))

        if not obj_id:
            obj_id = f"{object_mapping.object_type}_{i}"

        # Validation: check required properties
        issues = []
        if type_def:
            for prop_def in type_def.properties:
                if prop_def.required and prop_def.name not in props:
                    issues.append(f"missing required property: {prop_def.name}")

        evidence = EvidenceMetadata(
            source_type="data_pipeline",
            source_id=object_mapping.id_column,
            reason=f"mapped from row {i}",
            confidence=object_mapping.confidence,
            generated_by="data_pipeline_transformer",
        )

        candidates.append(CandidateObject(
            id=obj_id,
            type=object_mapping.object_type,
            properties=props,
            source_row=i,
            confidence=object_mapping.confidence,
            evidence=f"mapped from {object_mapping.id_column}",
            validation_issues=issues,
        ))

    return candidates


def generate_candidate_links(
    rows: list[dict[str, Any]],
    link_mappings: list[LinkMapping],
    schema: OntologySchema,
) -> list[CandidateLink]:
    """Generate candidate ontology links from rows using link mappings."""
    candidates = []

    for lm in link_mappings:
        for i, row in enumerate(rows):
            source_id = str(row.get(lm.source_id_column, ""))
            target_id = str(row.get(lm.target_id_column, ""))

            if not source_id or not target_id:
                continue

            props = {}
            for fm in lm.field_mappings:
                value = row.get(fm.source_column)
                if value is not None:
                    props[fm.target_property] = value

            issues = []
            link_def = schema.link_types.get(lm.link_type)
            if not link_def:
                issues.append(f"unknown link type: {lm.link_type}")

            candidates.append(CandidateLink(
                source_id=source_id,
                target_id=target_id,
                type=lm.link_type,
                properties=props,
                source_row=i,
                confidence=lm.confidence,
                evidence=f"mapped from row {i}",
                validation_issues=issues,
            ))

    return candidates

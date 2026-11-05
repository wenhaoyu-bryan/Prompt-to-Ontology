"""Transformer — generates candidate objects and links from mapped rows."""

from __future__ import annotations

from typing import Any

from ontology_kernel.models import OntologySchema

from .models import (
    CandidateLink,
    CandidateObject,
    LinkMapping,
    ObjectMapping,
)
from .property_values import coerce_link_property, coerce_property, requires_per_100g_confirmation


def generate_candidate_objects(
    rows: list[dict[str, Any]],
    object_mapping: ObjectMapping,
    schema: OntologySchema,
    validation_issues: list[dict[str, Any]],
    unit_confirmations: dict[str, str],
) -> list[CandidateObject]:
    """Generate schema-typed candidates and identify invalid source values."""
    candidates = []
    type_def = schema.object_types.get(object_mapping.object_type)
    properties = {prop.name: prop for prop in type_def.properties} if type_def else {}
    identity_columns = [
        mapping.source_column for mapping in object_mapping.field_mappings
        if type_def and mapping.target_property == type_def.primary_key
    ]

    for i, row in enumerate(rows):
        props = {}
        issues = []
        obj_id = row_id(row, object_mapping.id_column)
        for column in identity_columns:
            obj_id = row_id(row, column) or obj_id
        if not obj_id:
            obj_id = f"{object_mapping.object_type}_{i}"

        for mapping in object_mapping.field_mappings:
            column, target = mapping.source_column, mapping.target_property
            value = row.get(column)
            if value is None or str(value).strip() == "":
                continue
            prop = properties.get(target)
            code = ""
            if (
                prop and requires_per_100g_confirmation(column, target)
                and unit_confirmations.get(column) != "per_100g"
            ):
                code = "UNIT_CONFIRMATION_REQUIRED"
                detail = f"Confirm values for {column!r} are already per 100g"
            else:
                try:
                    props[target] = coerce_property(value, prop.type) if prop else value
                except (ValueError, TypeError, OverflowError):
                    code = "INVALID_PROPERTY_TYPE"
                    detail = f"Value from {column!r} does not match {target!r} type {prop.type.value!r}"
            if code:
                message = f"Row {i}: {detail}"
                validation_issues.append({
                    "level": "error", "code": code, "message": message, "object_id": obj_id,
                    "link_id": "", "field": column, "row": i,
                })
                issues.append(message)

        if type_def:
            for prop_def in type_def.properties:
                if prop_def.required and prop_def.name not in props:
                    issues.append(f"missing required property: {prop_def.name}")

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


def row_id(row: dict[str, Any], column: str) -> str:
    value = row.get(column)
    return "" if value is None else str(value).strip()


def mapped_link_property(
    link_type: str, target: str, column: str, value: Any, row: int,
    source_id: str, target_id: str, issues: list[dict[str, Any]],
) -> Any:
    try:
        return coerce_link_property(link_type, target, value)
    except (ValueError, TypeError, OverflowError):
        issues.append({
            "level": "error", "code": "INVALID_LINK_PROPERTY",
            "message": f"Row {row}: Invalid value from {column!r} for {target!r}",
            "object_id": source_id, "link_id": f"{source_id}->{target_id}", "field": column, "row": row,
        })
        return None


def generate_candidate_links(
    rows: list[dict[str, Any]],
    link_mappings: list[LinkMapping],
    schema: OntologySchema,
    validation_issues: list[dict[str, Any]],
) -> list[CandidateLink]:
    """Generate candidate ontology links from rows using link mappings."""
    candidates = []

    for lm in link_mappings:
        for i, row in enumerate(rows):
            source_id = row_id(row, lm.source_id_column)
            target_id = row_id(row, lm.target_id_column)

            if not source_id or not target_id:
                continue

            props = {}
            for fm in lm.field_mappings:
                value = row.get(fm.source_column)
                if value is None or str(value).strip() == "":
                    continue
                value = mapped_link_property(
                    lm.link_type, fm.target_property, fm.source_column, value, i,
                    source_id, target_id, validation_issues,
                )
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

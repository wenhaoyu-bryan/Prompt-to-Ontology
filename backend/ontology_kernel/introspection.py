"""Schema introspection — converts OntologySchema into API/frontend-friendly summaries."""

from __future__ import annotations

from typing import Any

from .models import OntologySchema
from .versioning import compute_schema_hash, get_schema_version


def get_schema_summary(schema: OntologySchema) -> dict[str, Any]:
    """Full schema summary including version, hash, and counts."""
    return {
        "domain": schema.domain,
        "schema_version": get_schema_version(schema),
        "schema_hash": compute_schema_hash(schema),
        "counts": {
            "object_types": len(schema.object_types),
            "link_types": len(schema.link_types),
            "rules": len(schema.rules),
            "actions": len(schema.actions),
            "constraints": len(schema.constraints),
        },
        "object_types": list(schema.object_types.keys()),
        "link_types": list(schema.link_types.keys()),
        "rules": list(schema.rules.keys()),
        "actions": list(schema.actions.keys()),
    }


def get_object_type_summary(schema: OntologySchema) -> list[dict[str, Any]]:
    """Summary for each object type."""
    result = []
    for name, ot in schema.object_types.items():
        # Find connected link types
        connected_links = []
        for lt_name, lt in schema.link_types.items():
            if lt.source_type == name or lt.target_type == name:
                connected_links.append({
                    "name": lt_name,
                    "direction": "outgoing" if lt.source_type == name else "incoming",
                    "connected_to": lt.target_type if lt.source_type == name else lt.source_type,
                })

        # Find rules that reference this type
        connected_rules = []
        for r_name, r in schema.rules.items():
            if r.condition_params.get("species") or name == "PetFoodProduct":
                connected_rules.append(r_name)

        result.append({
            "name": name,
            "label": ot.label,
            "description": ot.description,
            "property_count": len(ot.properties),
            "properties": [{"name": p.name, "type": p.type.value, "required": p.required} for p in ot.properties],
            "primary_key": ot.primary_key,
            "connected_links": connected_links,
            "connected_rules": connected_rules[:5],
        })
    return result


def get_link_type_summary(schema: OntologySchema) -> list[dict[str, Any]]:
    """Summary for each link type."""
    result = []
    for name, lt in schema.link_types.items():
        result.append({
            "name": name,
            "label": lt.label,
            "description": lt.description,
            "source_type": lt.source_type,
            "target_type": lt.target_type,
            "cardinality": lt.cardinality.value,
        })
    return result


def get_rule_summary(schema: OntologySchema) -> list[dict[str, Any]]:
    """Summary for each rule."""
    result = []
    for key, r in schema.rules.items():
        result.append({
            "key": key,
            "rule_id": r.rule_id,
            "name": r.name,
            "severity": r.severity,
            "description": r.description,
            "condition_type": r.condition_type,
            "condition_params": r.condition_params,
            "output_link_type": r.output_link_type,
        })
    return result


def get_constraint_summary(schema: OntologySchema) -> list[dict[str, Any]]:
    """Summary for each constraint."""
    result = []
    for name, c in schema.constraints.items():
        result.append({
            "name": name,
            "constraint_type": c.constraint_type,
            "description": c.description,
            "target_type": c.target_type,
            "parameters": c.parameters,
        })
    return result

"""Schema Loader v2 — loads YAML ontology definitions into typed OntologySchema."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from .models import (
    ActionTypeDef,
    Cardinality,
    ConstraintDef,
    LinkTypeDef,
    ObjectTypeDef,
    OntologySchema,
    PropertyDef,
    PropertyType,
    RuleDef,
)

# Map YAML property names to PropertyType enum (best-effort)
_TYPE_MAP: dict[str, PropertyType] = {
    "string": PropertyType.STRING,
    "str": PropertyType.STRING,
    "number": PropertyType.NUMBER,
    "float": PropertyType.NUMBER,
    "integer": PropertyType.INTEGER,
    "int": PropertyType.INTEGER,
    "boolean": PropertyType.BOOLEAN,
    "bool": PropertyType.BOOLEAN,
    "enum": PropertyType.ENUM,
    "list": PropertyType.LIST,
    "object": PropertyType.OBJECT,
    "date": PropertyType.DATE,
    "datetime": PropertyType.DATETIME,
}


def _infer_property_type(name: str) -> PropertyType:
    """Infer property type from field name conventions."""
    lower = name.lower()
    if lower.endswith(("_id", "_name", "_type", "barcode")):
        return PropertyType.STRING
    if lower.endswith(("_100g", "count", "quantity")):
        return PropertyType.NUMBER
    if "allergen" in lower or "risk_tag" in lower:
        return PropertyType.STRING
    return PropertyType.STRING


def _normalize_object_types(raw: dict[str, Any]) -> dict[str, ObjectTypeDef]:
    result = {}
    for name, data in (raw or {}).items():
        if not isinstance(data, dict):
            continue
        props_raw = data.get("properties", [])
        properties = []
        required = []
        for p in props_raw:
            if isinstance(p, str):
                prop = PropertyDef(name=p, type=_infer_property_type(p))
            elif isinstance(p, dict):
                prop = PropertyDef(
                    name=p.get("name", ""),
                    type=_TYPE_MAP.get(p.get("type", "string"), PropertyType.STRING),
                    required=p.get("required", False),
                    description=p.get("description", ""),
                    enum_values=p.get("enum_values", []),
                    default=p.get("default"),
                    unit=p.get("unit", ""),
                    source_field=p.get("source_field", ""),
                )
            else:
                continue
            properties.append(prop)
            if prop.required:
                required.append(prop.name)

        pk = data.get("primary_key", "")
        if not pk and properties:
            # Guess: first property ending with _id
            for prop in properties:
                if prop.name.endswith("_id"):
                    pk = prop.name
                    break

        result[name] = ObjectTypeDef(
            name=name,
            label=data.get("label", name),
            description=data.get("description", ""),
            properties=properties,
            primary_key=pk,
            display_name=data.get("display_name", ""),
            required_properties=required or data.get("required_fields", []),
            metadata=data.get("metadata", {}),
        )
    return result


def _normalize_link_types(raw: dict[str, Any]) -> dict[str, LinkTypeDef]:
    result = {}
    for name, data in (raw or {}).items():
        if not isinstance(data, dict):
            continue
        cardinality_str = data.get("cardinality", "MANY_TO_MANY")
        try:
            cardinality = Cardinality(cardinality_str)
        except ValueError:
            cardinality = Cardinality.MANY_TO_MANY

        result[name] = LinkTypeDef(
            name=name,
            label=data.get("label", name),
            description=data.get("description", ""),
            source_type=data.get("from", data.get("source", "")),
            target_type=data.get("to", data.get("target", "")),
            cardinality=cardinality,
            direction=data.get("direction", "outgoing"),
            required=data.get("required", False),
            metadata=data.get("metadata", {}),
        )
    return result


def _normalize_rules(raw: dict[str, Any]) -> dict[str, RuleDef]:
    result = {}
    for key, data in (raw or {}).items():
        if not isinstance(data, dict):
            continue
        condition = data.get("condition", {})
        result[key] = RuleDef(
            rule_id=data.get("rule_id", key),
            name=data.get("name", key),
            severity=data.get("severity", "info"),
            description=data.get("explanation", data.get("description", "")),
            condition_type=condition.get("type", ""),
            condition_params={k: v for k, v in condition.items() if k != "type"},
            output_link_type=data.get("output_link_type", "TRIGGERS_RISK"),
            metadata=data.get("metadata", {}),
        )
    return result


def _normalize_actions(raw: dict[str, Any]) -> dict[str, ActionTypeDef]:
    result = {}
    for name, data in (raw or {}).items():
        if not isinstance(data, dict):
            continue
        result[name] = ActionTypeDef(
            name=name,
            description=data.get("description", ""),
            params=data.get("params", []),
            metadata=data.get("metadata", {}),
        )
    return result


def _normalize_constraints(raw: dict[str, Any]) -> dict[str, ConstraintDef]:
    """Normalize constraints.yaml into ConstraintDef objects."""
    result = {}
    for type_name, data in (raw or {}).items():
        if not isinstance(data, dict):
            continue
        idx = 0
        # Required fields
        for field_name in data.get("required_fields", []):
            idx += 1
            result[f"{type_name}_required_{idx}"] = ConstraintDef(
                name=f"{type_name}_required_{field_name}",
                description=f"{field_name} is required for {type_name}",
                constraint_type="required_field",
                parameters={"field": field_name},
                target_type=type_name,
            )
        # Enum constraints
        for field_name, values in data.get("enums", {}).items():
            result[f"{type_name}_enum_{field_name}"] = ConstraintDef(
                name=f"{type_name}_enum_{field_name}",
                description=f"{field_name} must be one of {values}",
                constraint_type="enum",
                parameters={"field": field_name, "values": values},
                target_type=type_name,
            )
        # Non-negative constraints
        for field_name in data.get("non_negative_fields", []):
            result[f"{type_name}_nonneg_{field_name}"] = ConstraintDef(
                name=f"{type_name}_nonneg_{field_name}",
                description=f"{field_name} must be >= 0 for {type_name}",
                constraint_type="non_negative",
                parameters={"field": field_name},
                target_type=type_name,
            )
    # Relationship constraints
    rels = (raw or {}).get("relationships", {})
    for link_name, data in rels.items():
        if isinstance(data, dict):
            result[f"rel_{link_name}"] = ConstraintDef(
                name=f"rel_{link_name}",
                description=f"Relationship {link_name}: {data.get('from', '')} -> {data.get('to', '')}",
                constraint_type="relationship",
                parameters={"from": data.get("from", ""), "to": data.get("to", "")},
                target_type=link_name,
            )
    return result


def load_ontology_schema(domain: str, ontology_path: str) -> OntologySchema:
    """Load YAML ontology files from *ontology_path* into a typed OntologySchema."""
    base = Path(ontology_path)

    def _load_yaml(filename: str) -> dict:
        path = base / filename
        if not path.exists():
            return {}
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return data if isinstance(data, dict) else {}

    raw_objects = _load_yaml("object_types.yaml")
    raw_links = _load_yaml("link_types.yaml")
    raw_rules = _load_yaml("rules.yaml")
    raw_actions = _load_yaml("action_types.yaml")
    raw_constraints = _load_yaml("constraints.yaml")

    return OntologySchema(
        domain=domain,
        object_types=_normalize_object_types(raw_objects.get("object_types", raw_objects)),
        link_types=_normalize_link_types(raw_links.get("link_types", raw_links)),
        rules=_normalize_rules(raw_rules.get("rules", raw_rules)),
        actions=_normalize_actions(raw_actions.get("action_types", raw_actions)),
        constraints=_normalize_constraints(raw_constraints.get("constraints", raw_constraints)),
    )


def load_pet_food_schema() -> OntologySchema:
    """Load the Pet Food demo ontology schema."""
    base = Path(__file__).resolve().parent.parent.parent / "ontology" / "pet_food"
    return load_ontology_schema("pet_food", str(base))

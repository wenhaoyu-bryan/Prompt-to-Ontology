"""Local, reviewable edits to checked-in ontology definitions.

Drafts are intentionally separate from ontology YAML. The fixed Pet Food
reader and its hashed evaluation inputs continue to use the checked-in files.
"""

import json
import os
from pathlib import Path
from threading import RLock

from ontology_kernel.models import MetricDef


_DRAFT_FILE = Path(__file__).resolve().parent / ".runtime" / "schema_drafts.json"
_LOCK = RLock()
EDITABLE_CATEGORIES = frozenset({"objectTypes", "linkTypes", "rules", "actionTypes", "metrics"})


def _read_all() -> dict:
    if not _DRAFT_FILE.exists():
        return {}
    data = json.loads(_DRAFT_FILE.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Schema draft storage must contain an object")
    return data


def _write_all(data: dict) -> None:
    _DRAFT_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = _DRAFT_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, _DRAFT_FILE)


def load_schema_drafts(domain: str) -> dict:
    with _LOCK:
        return _read_all().get(domain, {})


def validate_schema_draft(schema: dict, category: str, name: str, definition: dict) -> None:
    if category not in EDITABLE_CATEGORIES or name not in schema.get(category, {}):
        raise ValueError("Unknown ontology definition")
    original = schema[category][name]
    if set(definition) != set(original):
        raise ValueError("A draft must keep the original definition fields")
    for field, value in original.items():
        if not isinstance(definition[field], type(value)):
            raise ValueError(f"Invalid type for {field}")

    if category == "objectTypes":
        props = definition["properties"]
        if isinstance(props, list) and (not props or not all(isinstance(item, str) and item.strip() for item in props)):
            raise ValueError("Object properties must be non-empty names")
    elif category == "linkTypes":
        if definition["from"] not in schema["objectTypes"] or definition["to"] not in schema["objectTypes"]:
            raise ValueError("Link endpoints must be existing object types")
    elif category == "rules":
        if not definition.get("condition") or not definition.get("rule_id"):
            raise ValueError("Rule ID and condition are required")
        if definition["rule_id"] != original["rule_id"]:
            raise ValueError("Rule ID cannot be changed in a draft")
    elif category == "actionTypes":
        if definition["applicable_object_type"] not in schema["objectTypes"]:
            raise ValueError("Action object type must exist")
        for field in ("inputs", "result_fields"):
            if not all(isinstance(item, dict) and item.get("name") and item.get("type") for item in definition[field]):
                raise ValueError(f"{field} entries need a name and type")
    elif category == "metrics":
        MetricDef(name=name, **definition)
        if definition["object_type"] not in schema["objectTypes"]:
            raise ValueError("Metric object type must exist")
        if not definition["group_by"] or not all(isinstance(item, str) and item.strip() for item in definition["group_by"]):
            raise ValueError("Metric dimensions must be non-empty names")


def save_schema_draft(domain: str, category: str, name: str, definition: dict) -> dict:
    with _LOCK:
        data = _read_all()
        data.setdefault(domain, {}).setdefault(category, {})[name] = definition
        _write_all(data)
    return definition


def delete_schema_draft(domain: str, category: str, name: str) -> None:
    with _LOCK:
        data = _read_all()
        data.get(domain, {}).get(category, {}).pop(name, None)
        _write_all(data)

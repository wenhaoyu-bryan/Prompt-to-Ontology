"""Convert parsed DDL to editable definition candidates with physical lineage."""

import hashlib
import re
from pathlib import Path

from assisted_build.service import digest


def is_ddl_filename(name):
    return isinstance(name, str) and Path(name).suffix.lower() in {".sql", ".ddl"}


def prepare_ddl_sources(file, dialect):
    from assisted_build.sql_ddl import parse_ddl

    content = file.get("content")
    name = file.get("name")
    if not isinstance(name, str) or not isinstance(content, str):
        raise ValueError("Invalid DDL source")
    tables = parse_ddl(content.lstrip("\ufeff"), dialect=dialect)
    content_hash = hashlib.sha256(content.encode()).hexdigest()
    return [
        {
            "id": f"ddl-{index}",
            "name": table["name"],
            "filename": Path(name).name,
            "format": "ddl",
            "dialect": dialect,
            "content_hash": content_hash,
            "row_count": 0,
            "sample_rows": [],
            "columns": table["columns"],
            "table": table,
        }
        for index, table in enumerate(tables, start=1)
    ]


def _identifier(value, used, fallback):
    name = re.sub(r"[^A-Za-z0-9_]+", "_", value).strip("_")
    if not name or not name[0].isalpha():
        name = fallback + name
    name = name[:64]
    if name in used:
        base = name[:52]
        ordinal = 2
        while f"{base}_{ordinal}" in used:
            ordinal += 1
        name = f"{base}_{ordinal}"
    used.add(name)
    return name


def resolve_reference(source_table, target, tables):
    if "." in target:
        return target if target in tables else None
    schema, separator, _ = source_table.rpartition(".")
    local = f"{schema}.{target}" if separator else target
    return local if local in tables else None


def propose_ddl(sources):
    objects = []
    links = []
    warnings = []
    names = set()
    tables = {s["table"]["name"]: s for s in sources}
    objects_by_table = {}

    def warn(source, message):
        warnings.append({
            "level": "warning", "code": "DDL_MAPPING_REQUIRED", "message": message,
            "source_id": source["id"], "candidate_id": "",
        })

    for source in sources:
        table = source["table"]
        table_name = table["name"]
        raw = table_name.rsplit(".", 1)[-1]
        name = _identifier("".join(part[:1].upper() + part[1:] for part in re.findall(r"[A-Za-z0-9]+", raw)), names, "Entity")
        key = table["primary_key"]
        primary = key[0] if len(key) == 1 else None
        if primary is None:
            warn(source, f"{table_name} needs a single-column primary key before it can be included")
        fields = set()
        properties = [
            {
                "name": _identifier(col["name"], fields, "field"),
                "type": "string" if col["name"] == primary else col["type"],
                "required": col["required"] or col["name"] == primary,
                "description": (col.get("comment") or f"SQL column {col['name']} ({col['sql_type']})")[:2000],
                "unit": "",
                "source_id": source["id"],
                "source_column": col["name"],
            }
            for col in table["columns"]
        ]
        obj = {
            "id": f"o-{digest([table_name])[:12]}",
            "name": name,
            "label": name,
            "description": (table.get("comment") or f"Proposed from SQL table {table_name}")[:2000],
            "primary_key": next((p["name"] for p in properties if p["source_column"] == primary), ""),
            "display_name": "",
            "properties": properties,
            "source_id": source["id"],
            "decision": "pending",
            "intent": "new",
        }
        objects.append(obj)
        objects_by_table[table_name] = obj

    link_names = set()
    seen_references = set()
    for source in sources:
        table = source["table"]
        obj = objects_by_table[table["name"]]
        for fk in table["foreign_keys"]:
            target_name = resolve_reference(table["name"], fk["target_table"], tables)
            target = tables.get(target_name)
            if (
                not target
                or len(fk["columns"]) != 1
                or len(table["primary_key"]) != 1
                or len(target["table"]["primary_key"]) != 1
                or (fk["target_columns"] or target["table"]["primary_key"]) != target["table"]["primary_key"]
            ):
                warn(source, f"FK {table['name']}.{', '.join(fk['columns'])} → {fk['target_table']} needs a supported single-column mapping")
                continue
            to = objects_by_table[target_name]
            unique = fk["columns"] == table["primary_key"] or fk["columns"] in table["unique_keys"]
            column = fk["columns"][0]
            reference = (table["name"], target_name, column)
            if reference in seen_references:
                continue
            seen_references.add(reference)
            name = _identifier(f"REFERENCES_{obj['name']}_{to['name']}_{column}".upper(), link_names, "Reference")
            links.append({
                "id": f"l-{digest(reference)[:12]}",
                "name": name,
                "label": f"References {to['name']}",
                "description": f"Foreign key {table['name']}.{column} → {target_name}.{target['table']['primary_key'][0]}",
                "from": obj["name"],
                "to": to["name"],
                "cardinality": "ONE_TO_ONE" if unique else "MANY_TO_ONE",
                "source_id": source["id"],
                "source_column": table["primary_key"][0],
                "target_column": column,
                "decision": "pending",
                "intent": "new",
            })
    return objects, links, warnings

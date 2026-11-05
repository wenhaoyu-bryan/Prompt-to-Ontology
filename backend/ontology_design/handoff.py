"""Convert a reviewed build receipt into editable definitions with provenance."""

import copy
import json


def _structure(value):
    if isinstance(value, list):
        return [_structure(item) for item in value]
    if not isinstance(value, dict):
        return value
    result = {key: _structure(item) for key, item in value.items()
              if key not in {"source_bindings", "metadata", "constraints"}}
    if "source_type" in result and not result.get("properties"):
        result.pop("properties", None)
    if result.get("primary_key"):
        for prop in result.get("properties", []):
            if prop["name"] == result["primary_key"]:
                prop["required"] = True
        result["required_properties"] = [p["name"] for p in result["properties"] if p["required"]]
    return result


def _source_binding(run, source_id, field=""):
    source = next(item for item in run["sources"] if item["id"] == source_id)
    binding = {
        "kind": "ddl" if source["format"] == "ddl" else "tabular",
        "source_name": source.get("filename", source["name"]),
        "source_id": source_id,
        "source_field": field,
        "content_hash": source["content_hash"],
        "design_id": run["id"],
        "status": "imported",
    }
    if source["format"] == "ddl":
        binding["table"] = source["table"]["name"]
        column = next((col for col in source["table"]["columns"] if col["name"] == field), None)
        if column:
            binding["details"] = copy.deepcopy(column)
    return binding


def _document_bindings(run, candidate_id):
    documents = {doc["id"]: doc for doc in run.get("reference_documents", [])}
    result = []
    for suggestion in run.get("document_suggestions", []):
        if suggestion.get("target_id") != candidate_id:
            continue
        citation = suggestion["citation"]
        result.append({
            "kind": "document", "source_name": citation["name"],
            "source_id": citation["document_id"], "design_id": run["id"],
            "document_id": citation["document_id"],
            "content_hash": documents[citation["document_id"]]["content_hash"],
            "start_line": citation["start_line"], "end_line": citation["end_line"],
            "quote": citation["quote"], "status": "imported",
        })
    return result


def _with_previous_sources(definition, previous):
    definition["metadata"] = {**previous.get("metadata", {}), **definition.get("metadata", {})}
    if "constraints" in previous:
        definition["constraints"] = copy.deepcopy(previous["constraints"])
    definition["source_bindings"] = previous.get("source_bindings", []) + definition["source_bindings"]
    previous_properties = {prop["name"]: prop for prop in previous.get("properties", [])}
    for prop in definition.get("properties", []):
        old = previous_properties.get(prop["name"])
        if old:
            bindings = old.get("source_bindings", []) + prop["source_bindings"]
            prop.update(copy.deepcopy(old))
            prop["source_bindings"] = bindings
    return definition


def definitions_from_build(package, catalog, design_revision):
    if package["manifest"]["revision"] != design_revision:
        raise RuntimeError("Design revision changed; reopen the saved design")
    run = json.loads(next(file["content"] for file in package["files"] if file["name"] == "schema-design.json"))
    objects, links = [], []
    for change in run["preview"]["definitions"]:
        is_object = change["category"] == "object"
        candidates = run["objects"] if is_object else run["links"]
        candidate = next(item for item in candidates if item["name"] == change["name"])
        if candidate["decision"] != "accepted":
            continue
        current = catalog["object_types" if is_object else "link_types"].get(change["name"])
        if change["change"] == "add" and current is not None:
            raise RuntimeError(f"Definition {change['name']} already exists; review it in Ontology Manager")
        if current is not None and change["before"] is not None:
            if _structure(current) != _structure(change["before"]):
                raise RuntimeError(f"Definition {change['name']} changed; review it in Ontology Manager")
        definition = copy.deepcopy(change["after"])
        definition["source_bindings"] = [_source_binding(
            run, candidate["source_id"], "" if is_object else candidate["target_column"],
        )] + _document_bindings(run, candidate["id"])
        if is_object:
            candidate_properties = {prop["name"]: prop for prop in candidate["properties"]}
            for prop in definition["properties"]:
                source = candidate_properties.get(prop["name"])
                prop["source_bindings"] = []
                if source and source["source_column"]:
                    prop["source_field"] = source["source_column"]
                    prop["source_bindings"] = [_source_binding(run, source["source_id"], source["source_column"])]
                    prop["source_bindings"] += _document_bindings(run, f"{candidate['id']}/{prop['name']}")
                if prop["name"] == definition["primary_key"]:
                    prop["required"] = True
            definition["required_properties"] = [prop["name"] for prop in definition["properties"] if prop["required"]]
        if current is not None:
            definition = _with_previous_sources(definition, current)
        (objects if is_object else links).append(definition)
    return objects, links

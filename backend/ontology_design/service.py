"""Atomic local design catalog, kept separate from the reference runtime schema."""

import copy
import fcntl
import json
import math
import os
import re
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from pydantic import BaseModel

from ontology_kernel.schema_loader import load_ontology_schema
from schema_drafts import load_schema_drafts
from ontology_design.models import DesignObject, DesignLink


_LOCK = RLock()
_IDENTIFIER = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
MAX_STORAGE_BYTES = 8 * 1024 * 1024


def _data(value):
    return value.model_dump(mode="json") if isinstance(value, BaseModel) else value


def _source_bindings(bindings, old, trusted):
    if not isinstance(bindings, list) or len(bindings) > 32:
        raise ValueError("Expected at most 32 source references")
    result = []
    allowed = {"kind", "source_name", "source_id", "source_field", "table", "content_hash",
               "design_id", "document_id", "start_line", "end_line", "quote", "status", "details"}
    for binding in bindings:
        if not isinstance(binding, dict) or not set(binding) <= allowed:
            raise ValueError("Invalid source reference")
        binding = copy.deepcopy(binding)
        if binding.get("kind", "manual") not in {"ddl", "tabular", "document", "manual"}:
            raise ValueError("Unknown source reference kind")
        for field, value in binding.items():
            if field in {"start_line", "end_line"}:
                if type(value) is not int or value < 1:
                    raise ValueError("Source line numbers must be positive integers")
            elif field == "details":
                if not isinstance(value, dict):
                    raise ValueError("Source details must be an object")
            elif not isinstance(value, str) or len(value) > 4000:
                raise ValueError("Invalid source reference text")
        if binding.get("end_line", 1) < binding.get("start_line", 1):
            raise ValueError("Invalid source line range")
        verified = binding.get("status") == "imported" and (trusted or binding in old)
        binding["status"] = "imported" if verified else "manual"
        if binding not in result:
            result.append(binding)
    return result


def _properties(properties):
    by_name = {prop["name"]: prop for prop in properties}
    if len(by_name) != len(properties):
        raise ValueError("Property names must be unique within a definition")
    for prop in properties:
        values = prop["enum_values"]
        if len(values) > 200 or len(set(values)) != len(values) or any(not value.strip() for value in values):
            raise ValueError("Enum values must be distinct nonempty strings")
        if prop["type"] == "enum" and not values:
            raise ValueError("Enum properties need allowed values")
        if prop["type"] != "enum" and values:
            raise ValueError("Allowed values require the enum property type")
        if any(len(prop[field]) > 4000 for field in ("description", "unit", "source_field")):
            raise ValueError("Property text limit exceeded")
        default = prop["default"]
        if default is not None:
            kind = prop["type"]
            number_valid = False
            if kind == "number" and type(default) in (int, float):
                try:
                    number_valid = math.isfinite(default)
                except OverflowError:
                    raise ValueError("Numeric default is outside the supported range") from None
            valid = {
                "string": isinstance(default, str), "enum": default in values,
                "number": number_valid,
                "integer": type(default) is int,
                "boolean": type(default) is bool,
                "list": isinstance(default, list), "object": isinstance(default, dict),
                "date": isinstance(default, str), "datetime": isinstance(default, str),
            }[kind]
            if not valid:
                raise ValueError("Property default does not match its type")
    return by_name


class OntologyDesignService:
    def __init__(self, root=None, storage_path=None):
        self.root = Path(root) if root else Path(__file__).resolve().parents[2]
        self.storage_path = Path(storage_path) if storage_path else self.root / "backend/.runtime/ontology_design.json"

    @contextmanager
    def _locked(self):
        with _LOCK:
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            with self.storage_path.with_suffix(".lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                try:
                    yield
                finally:
                    fcntl.flock(lock, fcntl.LOCK_UN)

    def _base(self, domain):
        if not isinstance(domain, str) or not _IDENTIFIER.fullmatch(domain):
            raise KeyError("Unknown ontology domain")
        directory = self.root / "ontology" / domain
        if not (directory / "object_types.yaml").is_file():
            raise KeyError("Unknown ontology domain")
        schema = load_ontology_schema(domain, str(directory)).model_dump(mode="json")
        for obj in schema["object_types"].values():
            for prop in obj["properties"]:
                prop["source_bindings"] = []
                if prop["name"] == obj["primary_key"] or prop["name"] in obj["required_properties"]:
                    prop["required"] = True
            obj["required_properties"] = [prop["name"] for prop in obj["properties"] if prop["required"]]
            obj["source_bindings"] = []
        for link in schema["link_types"].values():
            link.update(properties=[], source_bindings=[])
        return schema

    def _read(self):
        if not self.storage_path.exists():
            return {}
        if self.storage_path.stat().st_size > MAX_STORAGE_BYTES:
            raise RuntimeError("Design catalog exceeds its storage limit")
        data = json.loads(self.storage_path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise RuntimeError("Invalid design catalog storage")
        return data

    def _catalog(self, domain, data):
        base = self._base(domain)
        saved = data.get(domain, {})
        return {
            **base, "revision": saved.get("revision", 1),
            "object_types": {**base["object_types"], **saved.get("object_types", {})},
            "link_types": {**base["link_types"], **saved.get("link_types", {})},
            "changes": saved.get("changes", []), "legacy_drafts": load_schema_drafts(domain),
        }

    def get_catalog(self, domain):
        with self._locked():
            return self._catalog(domain, self._read())

    def _references(self, catalog, name):
        related = any(name in (link["source_type"], link["target_type"]) for link in catalog["link_types"].values())
        related |= any(metric["object_type"] == name for metric in catalog["metrics"].values())
        related |= any(action["applicable_object_type"] == name for action in catalog["actions"].values())
        related |= any(constraint["target_type"] == name for constraint in catalog["constraints"].values())
        # The checked-in Pet Food rule conditions refer to product properties.
        related |= name == "PetFoodProduct" and bool(catalog["rules"])
        return related

    def _prepare(self, definition, previous, trusted):
        definition["source_bindings"] = _source_bindings(
            definition["source_bindings"], previous.get("source_bindings", []), trusted,
        )
        old_props = {prop["name"]: prop for prop in previous.get("properties", [])}
        for prop in definition["properties"]:
            prop["source_bindings"] = _source_bindings(
                prop["source_bindings"], old_props.get(prop["name"], {}).get("source_bindings", []), trusted,
            )
        return definition

    def _write(self, data):
        raw = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")
        if len(raw) > MAX_STORAGE_BYTES:
            raise ValueError("Design catalog storage limit exceeded")
        path = None
        try:
            with tempfile.NamedTemporaryFile(dir=self.storage_path.parent, prefix=".design-", delete=False) as stream:
                path = Path(stream.name)
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(path, self.storage_path)
        finally:
            if path is not None:
                path.unlink(missing_ok=True)

    def save_batch(self, domain, expected_revision, objects, links, *, trusted_sources=False, create_only=False):
        if type(expected_revision) is not int:
            raise ValueError("Expected a design revision")
        if not isinstance(objects, list) or not isinstance(links, list) or not 1 <= len(objects) + len(links) <= 100:
            raise ValueError("Save between 1 and 100 definitions at a time")
        prepared_objects = [DesignObject.model_validate(_data(item)).model_dump(mode="json") for item in objects]
        prepared_links = [DesignLink.model_validate(_data(item)).model_dump(mode="json") for item in links]
        for definitions in (prepared_objects, prepared_links):
            if len({item["name"] for item in definitions}) != len(definitions):
                raise ValueError("Supply each definition only once")
        with self._locked():
            data = self._read()
            catalog = self._catalog(domain, data)
            if catalog["revision"] != expected_revision:
                raise RuntimeError("Design changed; reload before saving")
            if create_only and any(
                definition["name"] in catalog[category]
                for category, definitions in (("object_types", prepared_objects), ("link_types", prepared_links))
                for definition in definitions
            ):
                raise RuntimeError("Definition already exists; open it to edit")
            before = copy.deepcopy(catalog)
            for category, definitions in (("object_types", prepared_objects), ("link_types", prepared_links)):
                for definition in definitions:
                    previous = catalog[category].get(definition["name"], {})
                    self._prepare(definition, previous, trusted_sources)
                    fields = _properties(definition["properties"])
                    if category == "object_types":
                        key = fields.get(definition["primary_key"])
                        if not key or key["type"] != "string" or not key["required"]:
                            raise ValueError("The primary key must be a required string property")
                        if definition["display_name"] and definition["display_name"] not in fields:
                            raise ValueError("Display name must refer to a defined property")
                        definition["required_properties"] = [prop["name"] for prop in definition["properties"] if prop["required"]]
                        has_sources = previous.get("source_bindings") or any(prop.get("source_bindings") for prop in previous.get("properties", []))
                        if previous and (self._references(before, definition["name"]) or has_sources):
                            if definition["primary_key"] != previous["primary_key"]:
                                raise ValueError("A referenced object's primary key cannot change")
                            for prop in previous["properties"]:
                                current = fields.get(prop["name"])
                                if current is None or current["type"] != prop["type"]:
                                    raise ValueError("Referenced properties cannot be removed or change type")
                    catalog[category][definition["name"]] = definition
            if len(catalog["object_types"]) > 200 or len(catalog["link_types"]) > 200:
                raise ValueError("Design catalog allows at most 200 object and relationship definitions each")
            for link in catalog["link_types"].values():
                if link["source_type"] not in catalog["object_types"] or link["target_type"] not in catalog["object_types"]:
                    raise ValueError("Relationship endpoints must refer to defined objects")
            changed = {
                category: {definition["name"]: {"before": before[category].get(definition["name"]), "after": definition}
                           for definition in definitions if definition != before[category].get(definition["name"])}
                for category, definitions in (("object_types", prepared_objects), ("link_types", prepared_links))
            }
            if not any(changed.values()):
                return before
            history = catalog["changes"]
            if len(history) >= 1000:
                raise ValueError("Design change history limit reached")
            catalog["revision"] += 1
            history.append({"revision": catalog["revision"], "at": datetime.now(timezone.utc).isoformat(),
                            "operator": "local_user", "definitions": changed})
            data[domain] = {key: catalog[key] for key in ("revision", "object_types", "link_types", "changes")}
            self._write(data)
            return catalog


service = OntologyDesignService()

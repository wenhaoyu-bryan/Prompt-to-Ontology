"""Persistent source revisions, upload contents and reviewed field mappings."""

from __future__ import annotations

import hashlib
import json
import shutil
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from .persistence import atomic_json, atomic_write


_LOCK = RLock()


def _id(prefix: str, value: str) -> str:
    return f"{prefix}_{hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]}"


class SourceCatalog:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._content_dir = self.path.with_suffix(".revisions")

    def _load(self) -> dict:
        if self.path.exists():
            return json.loads(self.path.read_text(encoding="utf-8"))
        return {"assets": {}, "revisions": {}, "mappings": {}}

    def reset(self) -> None:
        with _LOCK:
            atomic_json(self.path, {"assets": {}, "revisions": {}, "mappings": {}})
            if self._content_dir.exists():
                shutil.rmtree(self._content_dir)

    def register(self, source_name: str, source_type: str, content: bytes, columns: list[str]) -> dict:
        if not source_name or not columns or len(columns) != len(set(columns)):
            raise ValueError("A source needs a name and distinct columns")
        asset_id = _id("src", f"{source_type}:{source_name}")
        digest = hashlib.sha256(content).hexdigest()
        revision_id = _id("rev", f"{asset_id}:{digest}")
        with _LOCK:
            data = self._load()
            revision = data["revisions"].get(revision_id)
            if revision is not None and revision["content_sha256"] != digest:
                raise ValueError("Conflicting source revision")
            if revision is None:
                revision = data["revisions"][revision_id] = {
                    "asset_id": asset_id, "revision_id": revision_id,
                    "content_sha256": digest,
                    "fields": [
                        {"field_id": _id("fld", f"{asset_id}:{name}"), "source_column": name}
                        for name in columns
                    ],
                }
            revision.setdefault("created_at", datetime.now(timezone.utc).isoformat())
            if source_type.startswith("custom_"):
                # Publish metadata only after the immutable content is durable.
                atomic_write(self._content_dir / revision_id, content)
            data["assets"][asset_id] = {
                "asset_id": asset_id, "source_name": source_name,
                "source_type": source_type, "latest_revision_id": revision_id,
            }
            atomic_json(self.path, data)
            return deepcopy(revision)

    def load_content(self, revision_id: str) -> tuple[dict, bytes] | None:
        """Return registered upload content. Older metadata-only revisions are unavailable."""
        with _LOCK:
            data = self._load()
            revision = data["revisions"].get(revision_id)
            if revision is None:
                return None
            asset = data["assets"][revision["asset_id"]]
            path = self._content_dir / revision["revision_id"]
            if not asset["source_type"].startswith("custom_") or not path.is_file():
                return None
            content = path.read_bytes()
            if hashlib.sha256(content).hexdigest() != revision["content_sha256"]:
                raise ValueError("Stored source revision does not match its content hash")
            return {**revision, "source_name": asset["source_name"], "source_type": asset["source_type"]}, content

    def _field(self, data: dict, revision_id: str, field_id: str) -> dict:
        revision = data["revisions"].get(revision_id)
        if revision is None:
            raise ValueError("Unknown source revision")
        field = next((f for f in revision["fields"] if f["field_id"] == field_id), None)
        if field is None:
            raise ValueError("Field does not belong to source revision")
        return field

    def propose(self, revision_id: str, field_id: str, object_type: str, property_name: str, confidence: float) -> dict:
        with _LOCK:
            data = self._load()
            self._field(data, revision_id, field_id)
            key = f"{revision_id}:{field_id}"
            existing = data["mappings"].get(key)
            if existing and existing["status"] != "suggested":
                return deepcopy(existing)
            mapping = {
                "mapping_id": _id("map", key), "revision_id": revision_id,
                "field_id": field_id, "target_object_type": object_type,
                "target_property": property_name, "confidence": confidence,
                "status": "suggested", "resolution": None,
            }
            data["mappings"][key] = mapping
            atomic_json(self.path, data)
            return deepcopy(mapping)

    def decide(self, revision_id: str, field_id: str, object_type: str, property_name: str, resolution: str) -> dict:
        if resolution not in {"same", "alias", "separate"}:
            raise ValueError("resolution must be same, alias, or separate")
        if resolution != "separate" and (not object_type or not property_name):
            raise ValueError("A mapped field needs an object type and property")
        with _LOCK:
            data = self._load()
            self._field(data, revision_id, field_id)
            if resolution == "same":
                for mapping in data["mappings"].values():
                    if (mapping["revision_id"] == revision_id and mapping["field_id"] != field_id
                            and mapping["status"] == "confirmed"
                            and mapping["target_object_type"] == object_type
                            and mapping["target_property"] == property_name):
                        raise ValueError("Another field is already mapped to this property; use alias only after checking the semantics")
            key = f"{revision_id}:{field_id}"
            old = data["mappings"].get(key, {})
            mapping = {
                "mapping_id": _id("map", key), "revision_id": revision_id,
                "field_id": field_id,
                "target_object_type": object_type if resolution != "separate" else "",
                "target_property": property_name if resolution != "separate" else "",
                "confidence": old.get("confidence", 0),
                "status": "separate" if resolution == "separate" else "confirmed",
                "resolution": resolution,
                "decided_at": datetime.now(timezone.utc).isoformat(),
            }
            data["mappings"][key] = mapping
            atomic_json(self.path, data)
            return deepcopy(mapping)

    def source(self, revision_id: str) -> dict:
        with _LOCK:
            data = self._load()
            revision = data["revisions"].get(revision_id)
            if revision is None:
                raise ValueError("Unknown source revision")
            asset = data["assets"][revision["asset_id"]]
            result = {**deepcopy(revision), "source_name": asset["source_name"], "source_type": asset["source_type"],
                      "is_latest": asset["latest_revision_id"] == revision_id}
            for field in result["fields"]:
                field["mapping"] = deepcopy(data["mappings"].get(f"{revision_id}:{field['field_id']}"))
            return result

    def target(self, object_type: str, property_name: str) -> list[dict]:
        with _LOCK:
            data = self._load()
            result = []
            for mapping in data["mappings"].values():
                if (mapping["status"] != "confirmed" or mapping["target_object_type"] != object_type
                        or mapping["target_property"] != property_name):
                    continue
                revision = data["revisions"][mapping["revision_id"]]
                asset = data["assets"][revision["asset_id"]]
                field = self._field(data, mapping["revision_id"], mapping["field_id"])
                result.append({**deepcopy(mapping), "asset_id": revision["asset_id"],
                               "source_name": asset["source_name"], "source_column": field["source_column"],
                               "is_latest": asset["latest_revision_id"] == mapping["revision_id"]})
            return result

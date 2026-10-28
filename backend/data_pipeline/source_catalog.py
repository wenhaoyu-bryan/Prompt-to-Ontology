"""Persistent source revisions and explicitly reviewed field mappings.

Only source metadata and mapping decisions are stored. CSV row contents remain
in the pipeline's existing transient cache.
"""

from __future__ import annotations

import hashlib
import json
import os
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock


def _id(prefix: str, value: str) -> str:
    return f"{prefix}_{hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]}"


class SourceCatalog:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._lock = RLock()
        if self.path.exists():
            self._data = json.loads(self.path.read_text(encoding="utf-8"))
        else:
            self._data = {"assets": {}, "revisions": {}, "mappings": {}}

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary, self.path)

    def reset(self) -> None:
        with self._lock:
            self._data = {"assets": {}, "revisions": {}, "mappings": {}}
            self._save()

    def register(self, source_name: str, source_type: str, content: bytes, columns: list[str]) -> dict:
        if not source_name or not columns or len(columns) != len(set(columns)):
            raise ValueError("A source needs a name and distinct columns")
        asset_id = _id("src", f"{source_type}:{source_name}")
        digest = hashlib.sha256(content).hexdigest()
        revision_id = _id("rev", f"{asset_id}:{digest}")
        with self._lock:
            self._data["assets"][asset_id] = {
                "asset_id": asset_id, "source_name": source_name,
                "source_type": source_type, "latest_revision_id": revision_id,
            }
            if revision_id not in self._data["revisions"]:
                self._data["revisions"][revision_id] = {
                    "asset_id": asset_id, "revision_id": revision_id,
                    "content_sha256": digest,
                    "fields": [
                        {"field_id": _id("fld", f"{asset_id}:{name}"), "source_column": name}
                        for name in columns
                    ],
                }
            self._save()
            return deepcopy(self._data["revisions"][revision_id])

    def _field(self, revision_id: str, field_id: str) -> dict:
        revision = self._data["revisions"].get(revision_id)
        if revision is None:
            raise ValueError("Unknown source revision")
        field = next((f for f in revision["fields"] if f["field_id"] == field_id), None)
        if field is None:
            raise ValueError("Field does not belong to source revision")
        return field

    def propose(self, revision_id: str, field_id: str, object_type: str, property_name: str, confidence: float) -> dict:
        with self._lock:
            self._field(revision_id, field_id)
            key = f"{revision_id}:{field_id}"
            existing = self._data["mappings"].get(key)
            if existing and existing["status"] != "suggested":
                return deepcopy(existing)
            mapping = {
                "mapping_id": _id("map", key), "revision_id": revision_id,
                "field_id": field_id, "target_object_type": object_type,
                "target_property": property_name, "confidence": confidence,
                "status": "suggested", "resolution": None,
            }
            self._data["mappings"][key] = mapping
            self._save()
            return deepcopy(mapping)

    def decide(self, revision_id: str, field_id: str, object_type: str, property_name: str, resolution: str) -> dict:
        if resolution not in {"same", "alias", "separate"}:
            raise ValueError("resolution must be same, alias, or separate")
        if resolution != "separate" and (not object_type or not property_name):
            raise ValueError("A mapped field needs an object type and property")
        with self._lock:
            self._field(revision_id, field_id)
            if resolution == "same":
                for mapping in self._data["mappings"].values():
                    if (mapping["revision_id"] == revision_id and mapping["field_id"] != field_id
                            and mapping["status"] == "confirmed"
                            and mapping["target_object_type"] == object_type
                            and mapping["target_property"] == property_name):
                        raise ValueError("Another field is already mapped to this property; use alias only after checking the semantics")
            key = f"{revision_id}:{field_id}"
            old = self._data["mappings"].get(key, {})
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
            self._data["mappings"][key] = mapping
            self._save()
            return deepcopy(mapping)

    def source(self, revision_id: str) -> dict:
        with self._lock:
            revision = self._data["revisions"].get(revision_id)
            if revision is None:
                raise ValueError("Unknown source revision")
            asset = self._data["assets"][revision["asset_id"]]
            result = {**deepcopy(revision), "source_name": asset["source_name"], "source_type": asset["source_type"],
                      "is_latest": asset["latest_revision_id"] == revision_id}
            for field in result["fields"]:
                field["mapping"] = deepcopy(self._data["mappings"].get(f"{revision_id}:{field['field_id']}"))
            return result

    def target(self, object_type: str, property_name: str) -> list[dict]:
        with self._lock:
            result = []
            for mapping in self._data["mappings"].values():
                if (mapping["status"] != "confirmed" or mapping["target_object_type"] != object_type
                        or mapping["target_property"] != property_name):
                    continue
                revision = self._data["revisions"][mapping["revision_id"]]
                asset = self._data["assets"][revision["asset_id"]]
                field = self._field(mapping["revision_id"], mapping["field_id"])
                result.append({**deepcopy(mapping), "asset_id": revision["asset_id"],
                               "source_name": asset["source_name"], "source_column": field["source_column"],
                               "is_latest": asset["latest_revision_id"] == mapping["revision_id"]})
            return result

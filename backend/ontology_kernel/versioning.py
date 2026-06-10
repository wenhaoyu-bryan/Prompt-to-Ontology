"""Schema versioning — deterministic hash and comparison."""

from __future__ import annotations

import hashlib
import json

from .models import OntologySchema


def _schema_dict(schema: OntologySchema) -> dict:
    """Deterministic dict representation for hashing."""
    return {
        "domain": schema.domain,
        "object_types": {
            k: {
                "name": v.name,
                "description": v.description,
                "properties": [p.name for p in v.properties],
                "primary_key": v.primary_key,
            }
            for k, v in sorted(schema.object_types.items())
        },
        "link_types": {
            k: {
                "name": v.name,
                "source_type": v.source_type,
                "target_type": v.target_type,
            }
            for k, v in sorted(schema.link_types.items())
        },
        "rules": {
            k: {
                "rule_id": v.rule_id,
                "name": v.name,
                "severity": v.severity,
                "condition_type": v.condition_type,
            }
            for k, v in sorted(schema.rules.items())
        },
        "actions": {
            k: {"name": v.name}
            for k, v in sorted(schema.actions.items())
        },
        "constraints": {
            k: {
                "name": v.name,
                "constraint_type": v.constraint_type,
                "target_type": v.target_type,
            }
            for k, v in sorted(schema.constraints.items())
        },
    }


def get_schema_version(schema: OntologySchema) -> str:
    """Return the schema's declared version string."""
    return schema.version


def compute_schema_hash(schema: OntologySchema) -> str:
    """Compute a deterministic SHA-256 hash of the schema structure."""
    canonical = json.dumps(_schema_dict(schema), sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def compare_schema_versions(old: OntologySchema, new: OntologySchema) -> dict:
    """Compare two schemas and return a diff summary."""
    old_types = set(old.object_types.keys())
    new_types = set(new.object_types.keys())
    old_links = set(old.link_types.keys())
    new_links = set(new.link_types.keys())
    old_rules = set(old.rules.keys())
    new_rules = set(new.rules.keys())

    return {
        "domain_changed": old.domain != new.domain,
        "version_changed": old.version != new.version,
        "hash_changed": compute_schema_hash(old) != compute_schema_hash(new),
        "object_types_added": sorted(new_types - old_types),
        "object_types_removed": sorted(old_types - new_types),
        "link_types_added": sorted(new_links - old_links),
        "link_types_removed": sorted(old_links - new_links),
        "rules_added": sorted(new_rules - old_rules),
        "rules_removed": sorted(old_rules - new_rules),
    }

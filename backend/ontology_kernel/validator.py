"""Constraint Validator v2 — validates OntologyGraphPayload against OntologySchema."""

from __future__ import annotations

from .models import (
    IssueLevel,
    OntologyGraphPayload,
    OntologySchema,
    ValidationIssue,
)


def validate_graph_payload(
    payload: OntologyGraphPayload,
    schema: OntologySchema,
) -> list[ValidationIssue]:
    """Validate a graph payload against the ontology schema.

    Returns a list of ValidationIssue (empty = no issues).
    Does not raise on validation failures — returns structured issues.
    """
    issues: list[ValidationIssue] = []
    node_ids: set[str] = set()
    node_types: dict[str, str] = {}  # id -> type

    # ── Validate nodes ────────────────────────────────────────────────
    for node in payload.nodes:
        node_ids.add(node.id)
        node_types[node.id] = node.type

        # Type exists
        if node.type not in schema.object_types:
            issues.append(ValidationIssue(
                level=IssueLevel.ERROR,
                code="UNKNOWN_OBJECT_TYPE",
                message=f"Object type '{node.type}' is not defined in schema",
                object_id=node.id,
                actual=node.type,
                expected=", ".join(schema.object_types.keys()),
            ))
            continue

        type_def = schema.object_types[node.type]

        # Primary key exists
        if type_def.primary_key and type_def.primary_key not in node.properties:
            issues.append(ValidationIssue(
                level=IssueLevel.ERROR,
                code="MISSING_PRIMARY_KEY",
                message=f"Primary key '{type_def.primary_key}' missing for {node.type} '{node.id}'",
                object_id=node.id,
                field=type_def.primary_key,
            ))

        # Required properties
        for prop_def in type_def.properties:
            if prop_def.required and prop_def.name not in node.properties:
                issues.append(ValidationIssue(
                    level=IssueLevel.ERROR,
                    code="MISSING_REQUIRED_PROPERTY",
                    message=f"Required property '{prop_def.name}' missing for {node.type} '{node.id}'",
                    object_id=node.id,
                    field=prop_def.name,
                ))

        # Enum validation
        for prop_def in type_def.properties:
            if prop_def.enum_values and prop_def.name in node.properties:
                val = str(node.properties[prop_def.name])
                if val not in prop_def.enum_values:
                    issues.append(ValidationIssue(
                        level=IssueLevel.WARNING,
                        code="INVALID_ENUM_VALUE",
                        message=f"Value '{val}' for '{prop_def.name}' not in allowed values {prop_def.enum_values}",
                        object_id=node.id,
                        field=prop_def.name,
                        actual=val,
                        expected=", ".join(prop_def.enum_values),
                    ))

        # Unknown properties → warning
        known_props = {p.name for p in type_def.properties}
        if type_def.primary_key:
            known_props.add(type_def.primary_key)
        for key in node.properties:
            if key not in known_props:
                issues.append(ValidationIssue(
                    level=IssueLevel.INFO,
                    code="UNKNOWN_PROPERTY",
                    message=f"Unknown property '{key}' on {node.type} '{node.id}'",
                    object_id=node.id,
                    field=key,
                ))

    # ── Validate links ────────────────────────────────────────────────
    for link in payload.links:
        # Link type exists
        if link.type not in schema.link_types:
            issues.append(ValidationIssue(
                level=IssueLevel.ERROR,
                code="UNKNOWN_LINK_TYPE",
                message=f"Link type '{link.type}' is not defined in schema",
                link_id=f"{link.source_id}->{link.target_id}",
                actual=link.type,
            ))
            continue

        link_def = schema.link_types[link.type]

        # Source/target exist
        if link.source_id not in node_ids:
            issues.append(ValidationIssue(
                level=IssueLevel.ERROR,
                code="LINK_SOURCE_NOT_FOUND",
                message=f"Source node '{link.source_id}' not found in payload",
                link_id=f"{link.source_id}->{link.target_id}",
            ))
        if link.target_id not in node_ids:
            issues.append(ValidationIssue(
                level=IssueLevel.ERROR,
                code="LINK_TARGET_NOT_FOUND",
                message=f"Target node '{link.target_id}' not found in payload",
                link_id=f"{link.source_id}->{link.target_id}",
            ))

        # Source/target type matches link definition
        src_type = node_types.get(link.source_id, "")
        tgt_type = node_types.get(link.target_id, "")
        if link_def.source_type and src_type and src_type != link_def.source_type:
            issues.append(ValidationIssue(
                level=IssueLevel.ERROR,
                code="LINK_SOURCE_TYPE_MISMATCH",
                message=f"Link '{link.type}' expects source type '{link_def.source_type}', got '{src_type}'",
                link_id=f"{link.source_id}->{link.target_id}",
                expected=link_def.source_type,
                actual=src_type,
            ))
        if link_def.target_type and tgt_type and tgt_type != link_def.target_type:
            issues.append(ValidationIssue(
                level=IssueLevel.ERROR,
                code="LINK_TARGET_TYPE_MISMATCH",
                message=f"Link '{link.type}' expects target type '{link_def.target_type}', got '{tgt_type}'",
                link_id=f"{link.source_id}->{link.target_id}",
                expected=link_def.target_type,
                actual=tgt_type,
            ))

    # ── Validate rules reference valid types ──────────────────────────
    for rule_key, rule_def in schema.rules.items():
        # Check condition references valid types where applicable
        params = rule_def.condition_params
        # Some conditions reference species — not a type validation issue
        # but we can check output_link_type exists
        if rule_def.output_link_type and rule_def.output_link_type not in schema.link_types:
            issues.append(ValidationIssue(
                level=IssueLevel.WARNING,
                code="RULE_OUTPUT_LINK_UNKNOWN",
                message=f"Rule '{rule_key}' outputs link type '{rule_def.output_link_type}' which is not in schema",
                field="output_link_type",
                actual=rule_def.output_link_type,
            ))

    return issues

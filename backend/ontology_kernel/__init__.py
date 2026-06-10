"""Ontology Kernel v2 — domain-agnostic runtime layer for operational ontologies."""

from .models import (
    OntologySchema,
    ObjectTypeDef,
    PropertyDef,
    LinkTypeDef,
    ConstraintDef,
    RuleDef,
    ActionTypeDef,
    RuntimeObject,
    RuntimeLink,
    EvidenceMetadata,
    ValidationIssue,
    OntologyGraphPayload,
)
from .schema_loader import load_ontology_schema, load_pet_food_schema
from .validator import validate_graph_payload
from .evidence import create_evidence_metadata, create_rule_evidence_link
from .rule_result import RuleEvaluationResult
from .versioning import get_schema_version, compute_schema_hash, compare_schema_versions
from .introspection import (
    get_schema_summary,
    get_object_type_summary,
    get_link_type_summary,
    get_rule_summary,
    get_constraint_summary,
)

__all__ = [
    "OntologySchema", "ObjectTypeDef", "PropertyDef", "LinkTypeDef",
    "ConstraintDef", "RuleDef", "ActionTypeDef", "RuntimeObject", "RuntimeLink",
    "EvidenceMetadata", "ValidationIssue", "OntologyGraphPayload",
    "load_ontology_schema", "load_pet_food_schema",
    "validate_graph_payload",
    "create_evidence_metadata", "create_rule_evidence_link",
    "RuleEvaluationResult",
    "get_schema_version", "compute_schema_hash", "compare_schema_versions",
    "get_schema_summary", "get_object_type_summary", "get_link_type_summary",
    "get_rule_summary", "get_constraint_summary",
]

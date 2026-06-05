"""
Constraint Validator — 校验 graph payload 是否符合 ontology schema 和 constraints。
在写入 Neo4j 之前执行，error 阻止写入，warning 仅报告。
"""

from typing import Any
from ontology_registry import OntologyRegistry


class ValidationResult:
    def __init__(self):
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, msg: str):
        self.errors.append(msg)

    def warn(self, msg: str):
        self.warnings.append(msg)

    @property
    def valid(self) -> bool:
        return len(self.errors) == 0

    def to_dict(self) -> dict:
        return {
            "valid": self.valid,
            "errors": self.errors,
            "warnings": self.warnings,
            "summary": {
                "error_count": len(self.errors),
                "warning_count": len(self.warnings),
            },
        }


class ConstraintValidator:
    """基于 OntologyRegistry 加载的 schema 校验 graph payload。"""

    def __init__(self, registry: OntologyRegistry):
        self.registry = registry
        self.valid_types: set[str] = set(
            registry.load_object_types().get("object_types", {}).keys()
        )
        link_types = registry.load_link_types().get("link_types", {})
        self.valid_link_types: set[str] = set(link_types.keys())
        self.link_type_def: dict[str, dict] = link_types

        constraints = registry.load_constraints().get("constraints", {})
        self.type_constraints: dict[str, dict] = {
            k: v for k, v in constraints.items() if k != "relationships"
        }
        self.relationship_constraints: dict[str, dict] = constraints.get("relationships", {})

    def validate(self, payload: dict) -> dict:
        """
        校验整个 graph payload，返回 {"valid", "errors", "warnings", "summary"}。
        """
        result = ValidationResult()
        nodes = payload.get("nodes", [])
        edges = payload.get("edges", [])

        # 建立 node id → label 映射
        node_map: dict[str, str] = {}
        for node in nodes:
            self._validate_node(node, result)
            nid = node.get("id")
            label = node.get("label") or node.get("object_type") or ""
            if nid:
                node_map[nid] = label

        for edge in edges:
            self._validate_edge(edge, node_map, result)

        return result.to_dict()

    def _validate_node(self, node: dict, result: ValidationResult):
        nid = node.get("id")
        label = node.get("label") or node.get("object_type") or ""
        props = node.get("properties", {})

        if not nid:
            result.error(f"Node missing 'id': {node}")
            return

        if not label:
            result.error(f"Node '{nid}' missing 'label'")
            return

        if label not in self.valid_types:
            result.error(f"Node '{nid}' has unknown type '{label}'")
            return

        # 类型级约束
        constraints = self.type_constraints.get(label, {})

        # required fields
        for field in constraints.get("required_fields", []):
            if props.get(field) is None:
                result.error(f"Node '{nid}' ({label}) missing required field '{field}'")

        # enum constraints
        for field, allowed in constraints.get("enums", {}).items():
            val = props.get(field)
            if val is not None and val not in allowed:
                result.error(
                    f"Node '{nid}' ({label}) field '{field}' = '{val}' "
                    f"not in allowed values: {allowed}"
                )

        # number type check + non-negative
        for field in constraints.get("non_negative_fields", []):
            val = props.get(field)
            if val is None:
                continue
            if not isinstance(val, (int, float)):
                result.warn(
                    f"Node '{nid}' ({label}) field '{field}' is not numeric: {type(val).__name__}"
                )
                continue
            if val < 0:
                result.error(
                    f"Node '{nid}' ({label}) field '{field}' = {val} is negative"
                )

    def _validate_edge(self, edge: dict, node_map: dict[str, str], result: ValidationResult):
        source = edge.get("source")
        target = edge.get("target")
        link_type = edge.get("type") or edge.get("link_type") or ""

        if not source:
            result.error(f"Edge missing 'source': {edge}")
            return
        if not target:
            result.error(f"Edge missing 'target': {edge}")
            return
        if not link_type:
            result.error(f"Edge ({source}→{target}) missing 'type'")
            return

        if link_type not in self.valid_link_types:
            result.error(f"Edge ({source}→{target}) has unknown type '{link_type}'")
            return

        # source/target node existence
        src_label = node_map.get(source)
        tgt_label = node_map.get(target)
        if src_label is None:
            result.error(f"Edge ({source}→{target}) source node '{source}' not found in payload")
        if tgt_label is None:
            result.error(f"Edge ({source}→{target}) target node '{target}' not found in payload")

        # direction check against link_types.yaml
        lt_def = self.link_type_def.get(link_type, {})
        expected_from = lt_def.get("from")
        expected_to = lt_def.get("to")
        if expected_from and src_label and src_label != expected_from:
            result.error(
                f"Edge ({source}→{target}) type '{link_type}': "
                f"source is '{src_label}', expected '{expected_from}'"
            )
        if expected_to and tgt_label and tgt_label != expected_to:
            result.error(
                f"Edge ({source}→{target}) type '{link_type}': "
                f"target is '{tgt_label}', expected '{expected_to}'"
            )

        # TRIGGERS_RISK specific validation
        if link_type == "TRIGGERS_RISK":
            props = edge.get("properties", {})
            for field in ("severity", "evidence", "reason"):
                val = props.get(field)
                if not val:
                    result.error(
                        f"TRIGGERS_RISK edge ({source}→{target}) missing '{field}'"
                    )


def validate_payload(registry: OntologyRegistry, payload: dict) -> dict:
    """便捷函数：创建 validator 并校验 payload。"""
    validator = ConstraintValidator(registry)
    return validator.validate(payload)

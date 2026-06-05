"""
Ontology Registry — 从 YAML 配置加载任意 domain 的 ontology schema。
支持多 domain：pet_food, industrial, ...
"""

import os
import yaml
from pathlib import Path
from typing import Any


class OntologyRegistry:
    """加载并管理某个 domain 的 ontology 配置。"""

    def __init__(self, domain: str = "pet_food", base_dir: str | None = None):
        self.domain = domain
        if base_dir:
            self.base_dir = Path(base_dir)
        else:
            # 默认从项目根目录的 ontology/{domain}/ 读取
            self.base_dir = Path(__file__).resolve().parent.parent / "ontology" / domain

        self._object_types: dict | None = None
        self._link_types: dict | None = None
        self._constraints: dict | None = None
        self._rules: dict | None = None
        self._action_types: dict | None = None

    # ---- 文件路径 ----

    def _yaml_path(self, name: str) -> Path:
        return self.base_dir / f"{name}.yaml"

    def _load_yaml(self, name: str) -> dict:
        path = self._yaml_path(name)
        if not path.exists():
            raise FileNotFoundError(
                f"Ontology config not found: {path}\n"
                f"Domain '{self.domain}' may not be configured, "
                f"or the file is missing from ontology/{self.domain}/"
            )
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if data is None:
            raise ValueError(f"Empty YAML file: {path}")
        return data

    # ---- 加载方法 ----

    def load_object_types(self) -> dict:
        if self._object_types is None:
            self._object_types = self._load_yaml("object_types")
        return self._object_types

    def load_link_types(self) -> dict:
        if self._link_types is None:
            self._link_types = self._load_yaml("link_types")
        return self._link_types

    def load_constraints(self) -> dict:
        if self._constraints is None:
            self._constraints = self._load_yaml("constraints")
        return self._constraints

    def load_rules(self) -> dict:
        if self._rules is None:
            self._rules = self._load_yaml("rules")
        return self._rules

    def load_action_types(self) -> dict:
        if self._action_types is None:
            self._action_types = self._load_yaml("action_types")
        return self._action_types

    # ---- 聚合查询 ----

    def get_schema(self) -> dict[str, Any]:
        """返回完整 schema JSON，包含 objectTypes, linkTypes, constraints, rules, actionTypes。"""
        return {
            "domain": self.domain,
            "objectTypes": self.load_object_types().get("object_types", {}),
            "linkTypes": self.load_link_types().get("link_types", {}),
            "constraints": self.load_constraints().get("constraints", {}),
            "rules": self.load_rules().get("rules", {}),
            "actionTypes": self.load_action_types().get("action_types", {}),
        }

    def get_object_type(self, name: str) -> dict | None:
        """按名称查找某个 object type。"""
        types = self.load_object_types().get("object_types", {})
        return types.get(name)

    def get_link_type(self, name: str) -> dict | None:
        """按名称查找某个 link type。"""
        types = self.load_link_types().get("link_types", {})
        return types.get(name)

    def get_rule(self, name: str) -> dict | None:
        """按名称查找某个 rule。"""
        rules = self.load_rules().get("rules", {})
        return rules.get(name)

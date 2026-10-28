"""Read a small, fixed Pet Food question catalog without graph or data writes.

The catalog contains query plans only. Gold answers live in a separate file
used exclusively by the regression evaluator.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from pathlib import Path
from typing import Any

import yaml

from ontology_registry import OntologyRegistry
from rule_engine import RuleEngine

from .models import EvidenceRef, PathStep, VerifiedAnswer


_SOURCE_PATHS = {
    "pet_food_products.csv": "sample-data/pet-food/pet_food_products.csv",
    "pet_food_ingredients.csv": "sample-data/pet-food/pet_food_ingredients.csv",
    "product_ingredients.csv": "sample-data/pet-food/product_ingredients.csv",
    "rules.yaml": "ontology/pet_food/rules.yaml",
    "object_types.yaml": "ontology/pet_food/object_types.yaml",
    "metrics.yaml": "ontology/pet_food/metrics.yaml",
    "action_types.yaml": "ontology/pet_food/action_types.yaml",
}


class SourceUnavailable(Exception):
    pass


class VerifiedQAService:
    def __init__(self, root: Path, questions_path: Path | None = None):
        self.root = Path(root)
        self.questions_path = questions_path or self.root / "sample-data/pet-food/verified-questions.v2.json"
        data = json.loads(self.questions_path.read_text(encoding="utf-8"))
        self.catalog_version = data["version"]
        self._questions = {item["id"]: item for item in data["questions"]}

    def questions(self) -> list[dict]:
        return [
            {k: q[k] for k in ("id", "question", "question_zh", "depends_on")}
            for q in self._questions.values()
        ]

    def _read(self, name: str) -> tuple[bytes, str, str]:
        relative = _SOURCE_PATHS[name]
        try:
            content = (self.root / relative).read_bytes()
        except OSError as exc:
            raise SourceUnavailable(name) from exc
        return content, relative, hashlib.sha256(content).hexdigest()

    def _csv(self, name: str, versions: dict[str, str]) -> tuple[list[dict[str, str]], str, str]:
        content, relative, digest = self._read(name)
        try:
            reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
            if not reader.fieldnames or len(reader.fieldnames) != len(set(reader.fieldnames)):
                raise ValueError("missing or duplicate CSV headers")
            rows = list(reader)
        except (UnicodeError, csv.Error, ValueError) as exc:
            raise SourceUnavailable(name) from exc
        versions[relative] = digest
        return rows, relative, digest

    def _yaml(self, name: str, versions: dict[str, str]) -> tuple[dict, str, str]:
        content, relative, digest = self._read(name)
        try:
            data = yaml.safe_load(content)
            if not isinstance(data, dict):
                raise ValueError("YAML root must be a mapping")
        except (yaml.YAMLError, ValueError) as exc:
            raise SourceUnavailable(name) from exc
        versions[relative] = digest
        return data, relative, digest

    @staticmethod
    def _evidence(kind: str, source_path: str, digest: str, record_id: str, field: str, value: Any) -> EvidenceRef:
        key = f"{source_path}:{digest}:{record_id}:{field}"
        return EvidenceRef(
            evidence_id="ev-" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:16],
            kind=kind, source_path=source_path, source_sha256=digest,
            record_id=record_id, field=field, value=value,
        )

    @staticmethod
    def _unknown(question: dict, reasons: list[str], versions: dict[str, str]) -> VerifiedAnswer:
        return VerifiedAnswer(question_id=question["id"], question=question["question"],
                              status="unknown", conclusion="Cannot confirm from available sample evidence.",
                              unknown_reasons=reasons, source_versions=versions)

    def answer(self, question_id: str) -> VerifiedAnswer:
        question = self._questions.get(question_id)
        if question is None:
            raise ValueError("Unknown verified question ID")
        query = question["query"]
        versions: dict[str, str] = {}
        try:
            kind = query["type"]
            if kind == "rule_status":
                return self._rule_status(question, query, versions)
            if kind == "first_ingredient":
                return self._first_ingredient(question, query, versions)
            if kind == "field_value":
                return self._field_value(question, query, versions)
            if kind == "source_field":
                return self._source_field(question, query, versions)
            if kind == "mapping_policy":
                return self._unknown(question, ["mapping_decision_required"], versions)
            if kind == "metric_count":
                return self._metric_count(question, query, versions)
            if kind == "action_input":
                return self._action_input(question, query, versions)
            raise ValueError("Unsupported verified query type")
        except SourceUnavailable:
            return self._unknown(question, ["source_unavailable"], versions)

    def _product(self, question: dict, product_id: str, versions: dict[str, str]):
        rows, relative, digest = self._csv("pet_food_products.csv", versions)
        product = next((row for row in rows if row.get("product_id") == product_id), None)
        return product, relative, digest

    def _field_value(self, question: dict, query: dict, versions: dict[str, str]) -> VerifiedAnswer:
        product, relative, digest = self._product(question, query["product_id"], versions)
        if product is None:
            return self._unknown(question, ["instance_missing"], versions)
        required_time = query.get("requires_time_field")
        if required_time and not product.get(required_time):
            return self._unknown(question, ["trusted_time_missing"], versions)
        field = query["field"]
        if not product.get(field):
            return self._unknown(question, ["source_field_missing"], versions)
        value = product[field]
        evidence = self._evidence("fact", relative, digest, query["product_id"], field, value)
        return VerifiedAnswer(question_id=question["id"], question=question["question"],
                              status="answered", conclusion=f"{query['product_id']}.{field} = {value}",
                              value=value, evidence=[evidence], source_versions=versions)

    def _source_field(self, question: dict, query: dict, versions: dict[str, str]) -> VerifiedAnswer:
        schema, _, _ = self._yaml("object_types.yaml", versions)
        properties = schema.get("object_types", {}).get(query["object_type"], {}).get("properties", [])
        if query["property"] not in properties:
            return self._unknown(question, ["property_not_defined"], versions)
        rows, relative, digest = self._csv("pet_food_products.csv", versions)
        if not rows or query["property"] not in rows[0]:
            return self._unknown(question, ["source_field_missing"], versions)
        field = query["property"]
        evidence = self._evidence("source", relative, digest, "header", field, "candidate; mapping not confirmed")
        return VerifiedAnswer(question_id=question["id"], question=question["question"],
                              status="answered", conclusion=f"Candidate source: {relative}.{field}; mapping confirmation is separate.",
                              value=f"{relative}.{field}", evidence=[evidence],
                              path=[PathStep(kind="source_binding", source_id=f"{query['object_type']}.{field}",
                                             relation="CANDIDATE_SOURCE", target_id=f"{relative}.{field}",
                                             evidence_ids=[evidence.evidence_id])], source_versions=versions)

    def _first_ingredient(self, question: dict, query: dict, versions: dict[str, str]) -> VerifiedAnswer:
        product, _, _ = self._product(question, query["product_id"], versions)
        if product is None:
            return self._unknown(question, ["instance_missing"], versions)
        links, link_path, link_digest = self._csv("product_ingredients.csv", versions)
        ingredients, ingredient_path, ingredient_digest = self._csv("pet_food_ingredients.csv", versions)
        candidates = [row for row in links if row.get("product_id") == query["product_id"]]
        if not candidates:
            return self._unknown(question, ["instance_relation_missing"], versions)
        try:
            first = min(candidates, key=lambda row: int(row["ingredient_order"]))
        except (ValueError, KeyError, TypeError):
            return self._unknown(question, ["source_invalid"], versions)
        ingredient = next((row for row in ingredients if row.get("ingredient_id") == first["ingredient_id"]), None)
        if ingredient is None or not ingredient.get("ingredient_name"):
            return self._unknown(question, ["relation_target_missing"], versions)
        link_evidence = self._evidence("relationship", link_path, link_digest,
                                       f"{query['product_id']}:{first['ingredient_id']}", "ingredient_order", first["ingredient_order"])
        name_evidence = self._evidence("fact", ingredient_path, ingredient_digest,
                                       first["ingredient_id"], "ingredient_name", ingredient["ingredient_name"])
        return VerifiedAnswer(question_id=question["id"], question=question["question"],
                              status="answered", conclusion=f"{first['ingredient_id']} is first; its source name is {ingredient['ingredient_name']}.",
                              value=ingredient["ingredient_name"], evidence=[link_evidence, name_evidence],
                              path=[PathStep(kind="instance_relation", source_id=query["product_id"],
                                             relation="CONTAINS", target_id=first["ingredient_id"],
                                             evidence_ids=[link_evidence.evidence_id, name_evidence.evidence_id])],
                              source_versions=versions)

    def _rule_status(self, question: dict, query: dict, versions: dict[str, str]) -> VerifiedAnswer:
        product, product_path, product_digest = self._product(question, query["product_id"], versions)
        if product is None:
            return self._unknown(question, ["instance_missing"], versions)
        rules, rule_path, rule_digest = self._yaml("rules.yaml", versions)
        rule = next((item for item in rules.get("rules", {}).values() if item.get("rule_id") == query["rule_id"]), None)
        if rule is None:
            return self._unknown(question, ["rule_not_defined"], versions)
        condition = rule.get("condition", {})
        required_fields = [k for k in ("target_species", "life_stage") if k in condition]
        nutrition = condition.get("nutrition_threshold", condition)
        if "field" in nutrition:
            required_fields.append(nutrition["field"])
        evidence = [self._evidence("fact", product_path, product_digest, query["product_id"], field, product.get(field))
                    for field in required_fields if product.get(field) not in (None, "")]
        evidence.append(self._evidence("rule", rule_path, rule_digest, query["rule_id"], "condition", condition))

        ingredient_names: list[str] = []
        if condition.get("type") in {"ingredient_absence", "ingredient_match"}:
            links, link_path, link_digest = self._csv("product_ingredients.csv", versions)
            ingredients, ingredient_path, ingredient_digest = self._csv("pet_food_ingredients.csv", versions)
            product_links = [row for row in links if row.get("product_id") == query["product_id"]]
            if not product_links:
                return self._unknown(question, ["instance_relation_missing"], versions)
            names_by_id = {row.get("ingredient_id"): row.get("ingredient_name", "") for row in ingredients}
            if any(not names_by_id.get(row.get("ingredient_id")) for row in product_links):
                return self._unknown(question, ["relation_target_missing"], versions)
            ingredient_names = [names_by_id[row["ingredient_id"]].lower().strip() for row in product_links]
            evidence.extend(self._evidence("relationship", link_path, link_digest,
                                            f"{query['product_id']}:{row['ingredient_id']}", "ingredient_id", row["ingredient_id"])
                            for row in product_links)
            evidence.extend(self._evidence("fact", ingredient_path, ingredient_digest,
                                            row["ingredient_id"], "ingredient_name", names_by_id[row["ingredient_id"]])
                            for row in product_links)

        typed_product = dict(product)
        for field, value in product.items():
            if field.endswith("_100g"):
                try:
                    typed_product[field] = float(value) if value not in (None, "") else None
                except ValueError:
                    typed_product[field] = None
        registry = OntologyRegistry("pet_food", base_dir=str(self.root / "ontology/pet_food"))
        evaluation = next((result for result in RuleEngine(registry).evaluate_product_full(typed_product, ingredient_names)
                           if result["rule_id"] == query["rule_id"]), None)
        if evaluation is None:
            return self._unknown(question, ["rule_not_evaluable"], versions)
        if evaluation["status"] == "not_evaluable":
            return self._unknown(question, ["rule_not_evaluable"] + evaluation.get("missing_fields", []) + evaluation.get("missing_relations", []), versions)
        status = "not_applicable" if evaluation["status"] == "not_applicable" else "answered"
        path = PathStep(kind="rule_evaluation", source_id=query["product_id"], relation="EVALUATED_BY",
                        target_id=query["rule_id"], evidence_ids=[item.evidence_id for item in evidence])
        return VerifiedAnswer(question_id=question["id"], question=question["question"],
                              status=status, conclusion=f"{query['product_id']} / {query['rule_id']}: {evaluation['status']} ({evaluation['evidence']})",
                              value=evaluation["status"], evidence=evidence, path=[path], source_versions=versions)

    def _metric_count(self, question: dict, query: dict, versions: dict[str, str]) -> VerifiedAnswer:
        definitions, metric_path, metric_digest = self._yaml("metrics.yaml", versions)
        metric = definitions.get("metrics", {}).get(query["metric"])
        if not metric or metric.get("aggregation") != "count" or metric.get("group_by") != [query["filter_field"]]:
            return self._unknown(question, ["metric_not_defined"], versions)
        rows, data_path, data_digest = self._csv(metric["source_asset"], versions)
        if not rows or query["filter_field"] not in rows[0] or metric["grain"] not in rows[0]:
            return self._unknown(question, ["source_field_missing"], versions)
        selected = [row for row in rows if row[query["filter_field"]] == query["filter_value"]]
        if any(not row[metric["grain"]] for row in selected):
            return self._unknown(question, ["metric_grain_missing"], versions)
        evidence = [self._evidence("metric", metric_path, metric_digest, query["metric"], "definition", metric)]
        evidence.extend(self._evidence("fact", data_path, data_digest, row[metric["grain"]], query["filter_field"], row[query["filter_field"]]) for row in selected)
        path = PathStep(kind="metric_evaluation", source_id=metric["source_asset"], relation="COUNT_BY", target_id=query["metric"], evidence_ids=[item.evidence_id for item in evidence])
        return VerifiedAnswer(question_id=question["id"], question=question["question"], status="answered",
                              conclusion=f"{query['metric']}({query['filter_field']}={query['filter_value']}) = {len(selected)} {metric['unit']} in the sample snapshot.",
                              value=len(selected), evidence=evidence, path=[path], source_versions=versions)

    def _action_input(self, question: dict, query: dict, versions: dict[str, str]) -> VerifiedAnswer:
        definitions, source_path, digest = self._yaml("action_types.yaml", versions)
        action = definitions.get("action_types", {}).get(query["action"])
        if not action or not action.get("inputs"):
            return self._unknown(question, ["action_contract_missing"], versions)
        required = [item["name"] for item in action["inputs"] if item.get("required")]
        if not required:
            return self._unknown(question, ["action_required_input_missing"], versions)
        evidence = self._evidence("action", source_path, digest, query["action"], "inputs", action["inputs"])
        path = PathStep(kind="action_contract", source_id=query["action"], relation="REQUIRES_INPUT", target_id=required[0], evidence_ids=[evidence.evidence_id])
        return VerifiedAnswer(question_id=question["id"], question=question["question"], status="answered",
                              conclusion=f"{query['action']} requires {', '.join(required)}. This is a contract description; no action was executed.",
                              value=required[0], evidence=[evidence], path=[path], source_versions=versions)

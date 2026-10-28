"""Independent regression evaluation for the bounded Pet Food question set."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .models import VerifiedAnswer
from .service import VerifiedQAService


class VerifiedEvaluator:
    def __init__(self, root: Path, store_path: Path):
        self.root = Path(root)
        self.store_path = Path(store_path)
        self.draft_path = self.store_path.with_name("verified-question-drafts.json")
        self.service = VerifiedQAService(self.root)
        self.gold_path = self.root / "sample-data/pet-food/verified-gold.v2.json"

    @staticmethod
    def _read_store(path: Path) -> list[dict]:
        if not path.exists():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _write_store(path: Path, items: list[dict]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            temp.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(temp, path)
        finally:
            temp.unlink(missing_ok=True)

    def score(self, answer: VerifiedAnswer, expected: dict) -> dict[str, bool]:
        fields = {item.field for item in answer.evidence}
        paths = {item.kind for item in answer.path}
        expected_unknown = set(expected.get("unknown_reasons", []))
        evidence_ids = {item.evidence_id for item in answer.evidence}
        valid_sources = True
        for item in answer.evidence:
            source = self.root / item.source_path
            if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != item.source_sha256:
                valid_sources = False
                break
        expected_refs = expected.get("evidence_refs", [])
        has_refs = all(any(all(getattr(item, key) == value for key, value in ref.items()) for item in answer.evidence) for ref in expected_refs)
        valid_paths = all(bool(item.evidence_ids) and set(item.evidence_ids).issubset(evidence_ids) for item in answer.path)
        expected_paths = expected.get("path_edges", [])
        has_paths = all(any(all(getattr(item, key) == value for key, value in edge.items()) for item in answer.path) for edge in expected_paths)
        return {
            "conclusion": answer.status == expected["status"] and answer.value == expected.get("value"),
            "evidence": valid_sources and has_refs and set(expected.get("evidence_fields", [])).issubset(fields) and (not answer.evidence if expected["status"] == "unknown" else bool(answer.evidence)),
            "path": valid_paths and has_paths and set(expected.get("path_kinds", [])).issubset(paths) and (not answer.path if expected["status"] == "unknown" else True),
            "abstention": (set(answer.unknown_reasons) == expected_unknown) if expected["status"] == "unknown" else not answer.unknown_reasons,
        }

    def run(self, changed_assets: list[str] | None = None) -> dict:
        if changed_assets is not None and not isinstance(changed_assets, list):
            raise ValueError("changed_assets must be a list")
        selected = [q for q in self.service.questions() if changed_assets is None or set(q["depends_on"]) & set(changed_assets)]
        if not selected:
            raise ValueError("No questions depend on the selected assets")
        gold_bytes = self.gold_path.read_bytes()
        gold = json.loads(gold_bytes)
        if set(gold["answers"]) != {q["id"] for q in self.service.questions()}:
            raise ValueError("Gold set and public question catalog do not match")
        results: dict[str, dict] = {}
        for question in selected:
            answer = self.service.answer(question["id"])
            results[question["id"]] = {"answer": answer.model_dump(mode="json"), "scores": self.score(answer, gold["answers"][question["id"]]), "depends_on": question["depends_on"]}
        summary = {dimension: {"passed": sum(1 for result in results.values() if result["scores"][dimension]), "total": len(results)} for dimension in ("conclusion", "evidence", "path", "abstention")}
        try:
            commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=self.root, stderr=subprocess.DEVNULL, text=True).strip()
        except (OSError, subprocess.CalledProcessError):
            commit = None
        run = {
            "run_id": uuid.uuid4().hex, "created_at": datetime.now(timezone.utc).isoformat(),
            "catalog_version": self.service.catalog_version, "gold_version": gold["version"],
            "gold_sha256": hashlib.sha256(gold_bytes).hexdigest(), "code_commit": commit,
            "changed_assets": changed_assets, "summary": summary, "results": results,
        }
        runs = self._read_store(self.store_path)
        runs.append(run)
        self._write_store(self.store_path, runs)
        return run

    def list_runs(self) -> list[dict]:
        return [{k: run[k] for k in ("run_id", "created_at", "catalog_version", "changed_assets", "summary")} for run in reversed(self._read_store(self.store_path))]

    def get(self, run_id: str) -> dict:
        for run in self._read_store(self.store_path):
            if run["run_id"] == run_id:
                return run
        raise ValueError("Evaluation run not found")

    def compare(self, before_id: str, after_id: str) -> dict:
        before, after = self.get(before_id), self.get(after_id)
        questions = {}
        for question_id in after["results"]:
            old = before["results"].get(question_id)
            new = after["results"][question_id]
            old_answer = old["answer"] if old else None
            new_answer = new["answer"]
            fields = ("status", "value", "conclusion", "evidence", "path", "unknown_reasons", "source_versions")
            item = {field: {"before": old_answer.get(field) if old_answer else None, "after": new_answer.get(field)} for field in fields}
            item["scores"] = {"before": old["scores"] if old else None, "after": new["scores"]}
            item["changed"] = old is None or any(part["before"] != part["after"] for part in item.values() if isinstance(part, dict) and "before" in part)
            questions[question_id] = item
        return {"before_run_id": before_id, "after_run_id": after_id, "questions": questions}

    def propose_question(self, question: str, reason: str) -> dict:
        if not question.strip() or not reason.strip():
            raise ValueError("Question and reason are required")
        draft = {"draft_id": uuid.uuid4().hex, "question": question.strip(), "reason": reason.strip(), "status": "draft", "created_at": datetime.now(timezone.utc).isoformat()}
        drafts = self._read_store(self.draft_path)
        drafts.append(draft)
        self._write_store(self.draft_path, drafts)
        return draft

    def list_drafts(self) -> list[dict]:
        return list(reversed(self._read_store(self.draft_path)))

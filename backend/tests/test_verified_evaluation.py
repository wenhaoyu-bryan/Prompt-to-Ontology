"""P5: independent gold, four-dimensional regression checks and run diffs."""

import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from main import app
from verified_qa.evaluation import VerifiedEvaluator
from verified_qa.service import VerifiedQAService


ROOT = Path(__file__).resolve().parents[2]


class VerifiedEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.evaluator = VerifiedEvaluator(ROOT, Path(self.tmp.name) / "runs.json")

    def test_full_run_scores_22_checked_questions_separately(self):
        run = self.evaluator.run()
        self.assertEqual(len(run["results"]), 22)
        self.assertEqual(run["catalog_version"], "pet-food-verified-questions-v2")
        self.assertIn("gold_sha256", run)
        for dimension in ("conclusion", "evidence", "path", "abstention"):
            self.assertEqual(run["summary"][dimension], {"passed": 22, "total": 22})
        self.assertEqual(run["results"]["Q06"]["answer"]["status"], "unknown")

    def test_changed_asset_rerun_and_before_after_question_diff(self):
        before = self.evaluator.run()
        after = self.evaluator.run(changed_assets=["rules.yaml:RR004"])
        self.assertEqual(list(after["results"]), ["Q01"])
        diff = self.evaluator.compare(before["run_id"], after["run_id"])
        self.assertEqual(list(diff["questions"]), ["Q01"])
        self.assertFalse(diff["questions"]["Q01"]["changed"])
        self.assertIn("evidence", diff["questions"]["Q01"])

    def test_gold_only_evaluator_and_bad_answer_fails_dimensions(self):
        service = VerifiedQAService(ROOT)
        self.assertFalse(hasattr(service, "gold"))
        gold = json.loads((ROOT / "sample-data/pet-food/verified-gold.v2.json").read_text())
        self.assertEqual(set(gold["answers"]), {q["id"] for q in service.questions()})
        answer = service.answer("Q03").model_copy(deep=True)
        answer.value = "salmon"
        answer.evidence = []
        answer.path = []
        scores = self.evaluator.score(answer, gold["answers"]["Q03"])
        self.assertFalse(scores["conclusion"])
        self.assertFalse(scores["evidence"])
        self.assertFalse(scores["path"])
        good = service.answer("Q03").model_copy(deep=True)
        good.evidence[0].source_sha256 = "invalid"
        self.assertFalse(self.evaluator.score(good, gold["answers"]["Q03"])["evidence"])
        good = service.answer("Q03").model_copy(deep=True)
        good.path[0].target_id = "ING999"
        self.assertFalse(self.evaluator.score(good, gold["answers"]["Q03"])["path"])

    def test_feedback_creates_draft_only_and_does_not_change_gold(self):
        gold_path = ROOT / "sample-data/pet-food/verified-gold.v2.json"
        before = gold_path.read_bytes()
        draft = self.evaluator.propose_question("What is PF011's supplier?", "Need supplier source")
        self.assertEqual(draft["status"], "draft")
        self.assertEqual(gold_path.read_bytes(), before)
        self.assertEqual(len(self.evaluator.list_drafts()), 1)

    def test_api_exposes_run_compare_and_feedback(self):
        client = TestClient(app)
        run = client.post("/api/verified-qa/evaluations", json={"changed_assets": ["rules.yaml:RR004"]})
        self.assertEqual(run.status_code, 200)
        self.assertEqual(list(run.json()["results"]), ["Q01"])
        run_id = run.json()["run_id"]
        self.assertEqual(client.get(f"/api/verified-qa/evaluations/{run_id}").status_code, 200)
        comparison = client.get(f"/api/verified-qa/evaluations/compare?before={run_id}&after={run_id}")
        self.assertEqual(comparison.status_code, 200)
        self.assertFalse(comparison.json()["questions"]["Q01"]["changed"])
        self.assertEqual(client.post("/api/verified-qa/feedback", json={"question": "What is PF011's supplier?", "reason": "Source gap"}).json()["status"], "draft")


if __name__ == "__main__":
    unittest.main()

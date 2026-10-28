"""Make the fixed question snapshot and its claimed facts reproducible."""

import csv
import hashlib
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
QUESTION_SET = ROOT / "sample-data/pet-food/question-set.v1.json"


class PetFoodQuestionSetTests(unittest.TestCase):
    def test_snapshot_and_evidence(self):
        fixture = json.loads(QUESTION_SET.read_text(encoding="utf-8"))
        self.assertEqual(len(fixture["questions"]), 8)
        for path, digest in fixture["snapshot"].items():
            with self.subTest(snapshot=path):
                self.assertEqual(hashlib.sha256((ROOT / path).read_bytes()).hexdigest(), digest)

        for question in fixture["questions"]:
            with self.subTest(question=question["id"]):
                self.assertTrue(question["question"] and question["expected"] and question["limit"])
                for evidence in question["evidence"]:
                    with (ROOT / evidence["file"]).open(encoding="utf-8-sig", newline="") as handle:
                        rows = list(csv.DictReader(handle))
                    matches = [row for row in rows if row[evidence["key_column"]] == evidence["key"]]
                    self.assertTrue(any(all(row.get(k) == v for k, v in evidence["fields"].items()) for row in matches))

    def test_unanswerable_questions_have_no_pretend_evidence(self):
        questions = json.loads(QUESTION_SET.read_text(encoding="utf-8"))["questions"]
        gaps = [q for q in questions if q["category"] in {"data_gap", "source_conflict"}]
        self.assertEqual(len(gaps), 3)
        self.assertTrue(all(not q["evidence"] for q in gaps))


if __name__ == "__main__":
    unittest.main()

"""The legacy demo APIs must never write by default."""

import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app


class DemoWriteBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_direct_write_routes_are_closed_by_default(self):
        requests = [
            ("/api/action", {"action_name": "adjust_stock", "params": {}}),
            ("/api/dataset/clear", {"dataset": "all"}),
            ("/api/pipeline/batch-import", {"tables": []}),
            ("/api/demo/reset", {}),
            ("/api/demo/seed", {}),
            ("/api/demo/clear", {}),
            ("/api/graph/snapshots/example/restore", {}),
            ("/api/pet-food/import-sample", {}),
        ]
        with patch.dict(os.environ, {"ENABLE_LEGACY_DEMO_WRITES": "false"}):
            for path, body in requests:
                with self.subTest(path=path):
                    response = self.client.post(path, json=body)
                    self.assertEqual(response.status_code, 403, response.text)

            for path in ("/api/data/import/PetFoodProduct", "/api/data/import/nodes", "/api/data/import/edges"):
                with self.subTest(path=path):
                    response = self.client.post(path, files={"file": ("sample.csv", "id\nPF1\n", "text/csv")})
                    self.assertEqual(response.status_code, 403, response.text)

    def test_explicit_opt_in_reaches_existing_validation(self):
        with patch.dict(os.environ, {"ENABLE_LEGACY_DEMO_WRITES": "true"}):
            response = self.client.post("/api/dataset/clear", json={})
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()

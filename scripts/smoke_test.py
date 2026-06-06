"""
Smoke test for Prompt-to-Ontology Pet Food demo.
Tests all critical API endpoints and prints PASS / FAIL for each.
"""

import sys
import json
import urllib.request
import urllib.error

BASE = "http://localhost:8765"
PASS_COUNT = 0
FAIL_COUNT = 0


def test(name: str, method: str, path: str, body: dict | None = None):
    global PASS_COUNT, FAIL_COUNT
    url = f"{BASE}{path}"
    try:
        if method == "GET":
            req = urllib.request.Request(url)
        else:
            data = json.dumps(body or {}).encode()
            req = urllib.request.Request(url, data=data, method="POST")
            req.add_header("Content-Type", "application/json")

        with urllib.request.urlopen(req, timeout=10) as resp:
            status = resp.status
            resp_body = resp.read().decode()
            if 200 <= status < 300:
                print(f"  PASS  {name}  ({status})")
                PASS_COUNT += 1
                return json.loads(resp_body)
            else:
                print(f"  FAIL  {name}  (status={status})")
                FAIL_COUNT += 1
    except urllib.error.HTTPError as e:
        print(f"  FAIL  {name}  (HTTP {e.code})")
        FAIL_COUNT += 1
    except Exception as e:
        print(f"  FAIL  {name}  ({e})")
        FAIL_COUNT += 1
    return None


def main():
    global PASS_COUNT, FAIL_COUNT
    print("=" * 50)
    print("Prompt-to-Ontology Smoke Test")
    print("=" * 50)

    # 1. Health check
    test("GET /api/health", "GET", "/api/health")

    # 2. Domains
    test("GET /api/domains", "GET", "/api/domains")
    test("GET /api/domains/default", "GET", "/api/domains/default")

    # 3. Schema
    test("GET /api/ontology/pet_food/schema", "GET", "/api/ontology/pet_food/schema")

    # 4. Graph
    test("GET /api/graph", "GET", "/api/graph?dataset=pet_food")

    # 5. Risk explanation
    test("GET /api/pet-food/products/PF001/risk-explanation", "GET", "/api/pet-food/products/PF001/risk-explanation")

    # 6. Rule evaluations
    test("GET /api/pet-food/products/PF001/rule-evaluations", "GET", "/api/pet-food/products/PF001/rule-evaluations")

    # 7. Agent chat
    test(
        "POST /api/pet-food/agent/chat",
        "POST",
        "/api/pet-food/agent/chat",
        {"question": "Which products contain chicken?"},
    )

    print("=" * 50)
    print(f"Results: {PASS_COUNT} passed, {FAIL_COUNT} failed")
    print("=" * 50)
    sys.exit(0 if FAIL_COUNT == 0 else 1)


if __name__ == "__main__":
    main()

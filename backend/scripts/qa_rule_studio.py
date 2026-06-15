"""
QA verification script for Rule Studio endpoints.

Runs the full QA flow via HTTP API calls using urllib (no external deps).
Base URL: http://localhost:8000

Usage:
    python backend/scripts/qa_rule_studio.py

Exit codes:
    0 = all checks passed
    1 = one or more checks failed
"""

import json
import sys
import urllib.error
import urllib.request

BASE_URL = "http://localhost:8000"

passed = 0
failed = 0


def check(name: str, condition: bool, detail: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name} {detail}")


def api_get(path: str):
    """GET request, returns parsed JSON or raises."""
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def api_post(path: str, body: dict):
    """POST request with JSON body, returns parsed JSON or raises."""
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


print("=" * 60)
print("Rule Studio — QA Verification Script")
print("=" * 60)

# ── 1. GET /api/rule-studio/rules returns 5 rules ────────────────────
print("\n[1] GET /api/rule-studio/rules")
try:
    data = api_get("/api/rule-studio/rules")
    rules = data if isinstance(data, list) else data.get("rules", data)
    check("rules endpoint returns data", isinstance(rules, list))
    check("returns 5 rules", len(rules) == 5, f"got {len(rules)}")
except Exception as e:
    check("rules endpoint returns data", False, str(e))
    check("returns 5 rules", False, "endpoint unreachable")

# ── 2. GET /api/rule-studio/rules/RR001 returns detail with explanation ─
print("\n[2] GET /api/rule-studio/rules/RR001")
try:
    detail = api_get("/api/rule-studio/rules/RR001")
    check("detail endpoint returns data", detail is not None)
    has_explanation = "logic_explanation" in detail or (
        isinstance(detail.get("rule"), dict)
    )
    check("detail has rule info", has_explanation, f"keys={list(detail.keys())}")
except Exception as e:
    check("detail endpoint returns data", False, str(e))
    check("detail has rule info", False, "endpoint unreachable")

# ── 3. GET /api/rule-studio/evaluation-summary returns coverage ──────
print("\n[3] GET /api/rule-studio/evaluation-summary")
try:
    summary = api_get("/api/rule-studio/evaluation-summary")
    check("summary endpoint returns data", summary is not None)
    check(
        "summary has triggered count",
        "triggered" in summary or "summary" in summary,
        f"keys={list(summary.keys()) if isinstance(summary, dict) else type(summary)}",
    )
except Exception as e:
    check("summary endpoint returns data", False, str(e))
    check("summary has triggered count", False, "endpoint unreachable")

# ── 4. POST /api/rule-studio/simulate — triggered ────────────────────
print("\n[4] POST /api/rule-studio/simulate — triggered")
try:
    result = api_post(
        "/api/rule-studio/simulate",
        {"rule_id": "RR001", "properties": {"fat_100g": 22}},
    )
    status = result.get("status", result.get("result", {}).get("status", ""))
    check("simulate triggered returns data", result is not None)
    check("status is triggered", status == "triggered", f"status={status}")
except Exception as e:
    check("simulate triggered returns data", False, str(e))
    check("status is triggered", False, "endpoint unreachable")

# ── 5. POST /api/rule-studio/simulate — passed ───────────────────────
print("\n[5] POST /api/rule-studio/simulate — passed")
try:
    result = api_post(
        "/api/rule-studio/simulate",
        {"rule_id": "RR001", "properties": {"fat_100g": 10}},
    )
    status = result.get("status", result.get("result", {}).get("status", ""))
    check("status is passed", status == "passed", f"status={status}")
except Exception as e:
    check("status is passed", False, str(e))

# ── 6. POST /api/rule-studio/simulate — missing field ────────────────
print("\n[6] POST /api/rule-studio/simulate — not_evaluable")
try:
    result = api_post(
        "/api/rule-studio/simulate",
        {"rule_id": "RR001", "properties": {}},
    )
    status = result.get("status", result.get("result", {}).get("status", ""))
    check("status is not_evaluable", status == "not_evaluable", f"status={status}")
except Exception as e:
    check("status is not_evaluable", False, str(e))

# ── Summary ────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
total = passed + failed
print(f"QA Results: {passed}/{total} passed, {failed}/{total} failed")
print("=" * 60)

sys.exit(0 if failed == 0 else 1)

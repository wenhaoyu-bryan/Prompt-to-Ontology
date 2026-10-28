"""Tests for version decisions made from merged PRs."""

import unittest

from release_automation import make_plan, next_version, parse_impact


def body(impact):
    return "\n".join(
        f"- [{'x' if name == impact else ' '}] {name.title()} — release decision"
        for name in ("none", "patch", "minor")
    )


class ReleaseAutomationTests(unittest.TestCase):
    def test_requires_one_complete_release_decision(self):
        self.assertEqual(parse_impact(body("minor")), "minor")
        for invalid in ("", "- [x] Minor", body("none").replace("[ ] Patch", "[x] Patch")):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                parse_impact(invalid)

    def test_minor_and_patch_bump_zero_line(self):
        self.assertEqual(next_version("0.1.0", "minor"), "0.2.0")
        self.assertEqual(next_version("0.1.0", "patch"), "0.1.1")
        self.assertEqual(next_version("0.1.0", "none"), "0.1.0")
        with self.assertRaises(ValueError):
            next_version("1.0.0", "minor")

    def test_highest_impact_since_last_tag_wins(self):
        prs = [
            {"number": 3, "body": body("minor"), "mergeCommit": {"oid": "included-minor"}},
            {"number": 4, "body": body("patch"), "mergeCommit": {"oid": "included-patch"}},
            {"number": 2, "body": "old PR without the template", "mergeCommit": {"oid": "before-tag"}},
        ]
        result = make_plan("0.1.0", prs, ["included-minor", "included-patch"])
        self.assertEqual(result["version"], "0.2.0")
        self.assertEqual(result["pull_requests"], [{"number": 3, "impact": "minor"}, {"number": 4, "impact": "patch"}])


if __name__ == "__main__":
    unittest.main()

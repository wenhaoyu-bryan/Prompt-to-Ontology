"""Turn reviewed PR release-impact checkboxes into a version proposal."""

import argparse
import json
import re
from pathlib import Path

from release_version import parse_version


IMPACT_ORDER = {"none": 0, "patch": 1, "minor": 2}
IMPACT_LINE = re.compile(r"^\s*-\s*\[([ xX])\]\s*(None|Patch|Minor)\b", re.MULTILINE | re.IGNORECASE)


def parse_impact(body):
    choices = [(name.lower(), checked.lower() == "x") for checked, name in IMPACT_LINE.findall(body or "")]
    if len(choices) != 3 or {name for name, _ in choices} != set(IMPACT_ORDER):
        raise ValueError("PR body must contain one checkbox each for None, Patch, and Minor")
    selected = [name for name, checked in choices if checked]
    if len(selected) != 1:
        raise ValueError("Select exactly one release impact: None, Patch, or Minor")
    return selected[0]


def next_version(current, impact):
    core, prerelease = parse_version(current)
    if prerelease or core[0] != 0:
        raise ValueError("Automatic bumps currently support stable 0.x versions only")
    if impact == "minor":
        return f"0.{core[1] + 1}.0"
    if impact == "patch":
        return f"0.{core[1]}.{core[2] + 1}"
    if impact == "none":
        return current
    raise ValueError(f"Unknown release impact: {impact}")


def make_plan(current, pull_requests, commits):
    commit_set = set(commits)
    included = []
    highest = "none"
    for pr in pull_requests:
        merge = pr.get("mergeCommit") or {}
        if merge.get("oid") not in commit_set:
            continue
        impact = parse_impact(pr.get("body"))
        included.append({"number": pr["number"], "impact": impact})
        if IMPACT_ORDER[impact] > IMPACT_ORDER[highest]:
            highest = impact
    included.sort(key=lambda item: item["number"])
    return {"version": next_version(current, highest), "impact": highest, "pull_requests": included}


def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate = subparsers.add_parser("validate-pr")
    validate.add_argument("event", type=Path)
    plan = subparsers.add_parser("plan")
    plan.add_argument("--current", required=True)
    plan.add_argument("--prs", required=True, type=Path)
    plan.add_argument("--commits", required=True, type=Path)
    args = parser.parse_args()

    if args.command == "validate-pr":
        event = json.loads(args.event.read_text())
        impact = parse_impact(event["pull_request"].get("body"))
        print(f"Release impact: {impact}")
    else:
        pull_requests = json.loads(args.prs.read_text())
        commits = args.commits.read_text().splitlines()
        print(json.dumps(make_plan(args.current, pull_requests, commits)))


if __name__ == "__main__":
    main()

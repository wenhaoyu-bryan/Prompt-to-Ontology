"""Validate a proposed GitHub release against this repository's version files."""

import argparse
import json
import re
import subprocess
from functools import cmp_to_key
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TAG_PREFIX = "v"
SEMVER = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)


def parse_version(value):
    match = SEMVER.fullmatch(value)
    if not match:
        raise ValueError(f"Invalid SemVer version: {value!r}")
    core = tuple(int(part) for part in match.group(1, 2, 3))
    prerelease = match.group(4)
    identifiers = prerelease.split(".") if prerelease else None
    if identifiers and any(part.isdigit() and len(part) > 1 and part[0] == "0" for part in identifiers):
        raise ValueError(f"Numeric prerelease identifiers cannot have leading zeroes: {value!r}")
    return core, identifiers


def compare_versions(left, right):
    left_core, left_pre = parse_version(left)
    right_core, right_pre = parse_version(right)
    if left_core != right_core:
        return (left_core > right_core) - (left_core < right_core)
    if left_pre is None or right_pre is None:
        return (left_pre is None) - (right_pre is None)
    for a, b in zip(left_pre, right_pre):
        a_numeric, b_numeric = a.isdigit(), b.isdigit()
        if a_numeric != b_numeric:
            return -1 if a_numeric else 1
        if a != b:
            if a_numeric:
                return (int(a) > int(b)) - (int(a) < int(b))
            return (a > b) - (a < b)
    return (len(left_pre) > len(right_pre)) - (len(left_pre) < len(right_pre))


def validate(version, prerelease, files_only=False):
    _, identifiers = parse_version(version)
    if not files_only and bool(identifiers) != prerelease:
        raise ValueError("Prerelease checkbox must match the version suffix (e.g. -alpha.1)")

    product_version = (ROOT / "VERSION").read_text().strip()
    package = json.loads((ROOT / "frontend/package.json").read_text())
    lock = json.loads((ROOT / "frontend/package-lock.json").read_text())
    found = {
        "VERSION": product_version,
        "frontend/package.json": package["version"],
        "frontend/package-lock.json": lock["version"],
        "frontend/package-lock.json packages root": lock["packages"][""]["version"],
    }
    for path, value in found.items():
        if value != version:
            raise ValueError(f"{path} contains {value!r}; expected {version!r}")

    if files_only:
        print(f"Version files agree on {version}")
        return

    tags = subprocess.check_output(["git", "tag", "--list", f"{TAG_PREFIX}*"], cwd=ROOT, text=True).splitlines()
    existing = []
    for tag in tags:
        try:
            parse_version(tag[len(TAG_PREFIX):])
        except ValueError:
            continue
        existing.append(tag[len(TAG_PREFIX):])
    if existing:
        latest = max(existing, key=cmp_to_key(compare_versions))
        if compare_versions(version, latest) <= 0:
            raise ValueError(f"{TAG_PREFIX}{version} must be newer than existing tag {TAG_PREFIX}{latest}")
    print(f"Release version {TAG_PREFIX}{version} is valid")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("version", help="SemVer without the v prefix")
    parser.add_argument("--prerelease", action="store_true")
    parser.add_argument("--files-only", action="store_true", help="Check version files without requiring an unissued tag")
    args = parser.parse_args()
    validate(args.version, args.prerelease, files_only=args.files_only)

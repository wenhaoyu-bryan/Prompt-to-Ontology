import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import release_version
from release_version import compare_versions, parse_version


class ReleaseVersionTests(unittest.TestCase):
    def test_semver_precedence(self):
        ordered = ["1.0.4", "1.1.0-alpha.1", "1.1.0-alpha.2", "1.1.0-beta.1", "1.1.0"]
        for older, newer in zip(ordered, ordered[1:]):
            self.assertLess(compare_versions(older, newer), 0)
            self.assertGreater(compare_versions(newer, older), 0)

    def test_rejects_invalid_versions(self):
        for value in ("v1.0.5", "1.0", "01.0.0", "1.0.0-alpha.01", "1.0.0+build"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_version(value)

    def test_release_files_and_existing_tags(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            frontend = root / "frontend"
            frontend.mkdir()
            (root / "VERSION").write_text("0.1.0\n")
            (frontend / "package.json").write_text(json.dumps({"version": "0.1.0"}))
            lock = {"version": "0.1.0", "packages": {"": {"version": "0.1.0"}}}
            (frontend / "package-lock.json").write_text(json.dumps(lock))
            with patch.object(release_version, "ROOT", root), patch.object(
                release_version.subprocess, "check_output", return_value=""
            ):
                release_version.validate("0.1.0", False)
                with patch.object(release_version.subprocess, "check_output", return_value="v0.1.0\n"):
                    release_version.validate("0.1.0", False, files_only=True)
                    with self.assertRaisesRegex(ValueError, "newer than"):
                        release_version.validate("0.1.0", False)
                with patch.object(release_version.subprocess, "check_output", return_value="v1.0.4\n"):
                    with self.assertRaisesRegex(ValueError, "newer than"):
                        release_version.validate("0.1.0", False)
                (frontend / "package.json").write_text(json.dumps({"version": "0.1.1"}))
                with self.assertRaisesRegex(ValueError, "frontend/package.json"):
                    release_version.validate("0.1.0", False, files_only=True)
                with self.assertRaisesRegex(ValueError, "checkbox"):
                    release_version.validate("0.1.0-alpha.1", False)


if __name__ == "__main__":
    unittest.main()

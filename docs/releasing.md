# Release process

GitHub Releases are versioned snapshots of this repository's runnable Pet Food reference implementation. They do not certify production readiness or cross-domain behavior.

## Version policy

- `VERSION`, `frontend/package.json`, and both root version fields in `frontend/package-lock.json` carry the same version without the `v` prefix. The frontend settings screen and FastAPI metadata read these values.
- The supported version line begins at `v0.1.0`. While the public contracts are evolving, use Minor for new capabilities or compatibility changes and Patch for compatible fixes. Record migrations for breaking changes. Use `1.0.0` only after the supported API, schema, and file contracts are documented, tested, and stable.
- The previous `v1.0.0`–`v1.0.4` tags and GitHub Releases were removed on 2026-10-28 because they predated the current version policy. Their commits remain in Git history. `v0.1.0` remains the first active release.
- Never rewrite or reuse a release tag. The active **Protect version release tags** ruleset prevents updating or deleting `v*` tags; creation remains available to the release workflow.

## Decide the version for every feature PR

Every PR must select exactly one release impact in the [PR template](../.github/pull_request_template.md). CI checks the selection on PR creation, updates, and body edits. The version covers the whole repository, including the UI, API, Pet Food schema, and sample-data contract.

| Impact | Use when | Next version after `v0.1.0` |
| --- | --- | --- |
| None | Documentation, tests, release metadata, or internal maintenance with no user-visible change | No version change |
| Patch | Compatible fix to released behavior | `0.1.1` |
| Minor | New capability, meaningful UI/workflow change, or a compatibility change in `0.x` | `0.2.0` |

A `0.x` breaking change is Minor and must explain the migration. The highest impact among merged PRs since the latest tag determines the next version. Several PRs can share one release. A PR marked None is included in the eventual snapshot but does not cause a release on its own.

## Automated release path

1. Merge a feature PR through the protected `main` branch after its four required checks pass.
2. When the `main` **push** CI run succeeds, **Prepare Release** checks that the tested commit is still current, finds merged PRs since the latest tag, and creates or updates one `codex/release-next` PR. It updates `VERSION` and both frontend package files together. If there is no Patch or Minor impact, it does nothing.
3. GitHub puts the PR-triggered CI run for a `GITHUB_TOKEN`-created PR in an approval-required state. A maintainer must approve that run, review the release contents, wait for the four required checks, and merge the version PR through normal branch protection. A branch-only CI run does not satisfy this PR gate.
4. When the version PR's `main` **push** CI run succeeds, **Release** verifies that the commit is still current `main`, all version files match, the tag is new and newer than existing tags, and CI passed on that exact commit. It creates the protected `vX.Y.Z` tag and a GitHub Release with generated notes. A normal release becomes Latest.
5. Read back the Release and tag target. If publication fails after tag creation, inspect the partial state before retrying; never retarget an existing tag.

The version PR remains a deliberate merge gate. Feature PR merges do not push version commits directly to protected `main`. This also avoids version-file conflicts between parallel feature branches. To retry preparation after a transient failure, run **Prepare Release** manually on `main`. The existing **Release** manual workflow is a fallback and accepts a version without `v`; a suffix such as `-alpha.1` requires its prerelease checkbox.

## Scope

The workflows create version-file changes, a Git tag, and a GitHub Release. They do not deploy a hosted app, publish npm/PyPI packages, or push a container registry image. GitHub provides source archives on the Release page.

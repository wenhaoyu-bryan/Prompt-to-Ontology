# Release process

GitHub Releases are versioned snapshots of this repository's runnable Pet Food reference implementation. They are not a production-readiness certification or evidence that the framework works in other domains.

## Version policy

- The current project line starts at `0.1.0`. Its Git tags are `p2o-vMAJOR.MINOR.PATCH` (for example, `p2o-v0.1.0`). The `p2o-` namespace separates this line from the older `v1.0.0`–`v1.0.4` tags. The numeric part follows SemVer; `VERSION`, `frontend/package.json`, and both root version fields in `frontend/package-lock.json` contain only that numeric part. The frontend settings screen and FastAPI OpenAPI metadata read those values.
- `0.x` means the public contracts are still evolving. Increase `MINOR` for a meaningful user-facing milestone or compatibility change; increase `PATCH` for compatible fixes. Document any breaking changes in release notes. Use `1.0.0` only after the supported API and file/schema contracts are documented, tested, and treated as stable. A suffix such as `0.2.0-alpha.1` is an additional prerelease stage and must use the workflow's prerelease checkbox. Build metadata (`+...`) is deliberately excluded from release tags.
- Do not rewrite or move an existing tag. Fixes receive a new version. The release workflow requires a version newer than every existing `p2o-v*` SemVer tag and refuses a reused tag.
- The repository's active **Protect version release tags** ruleset blocks updates and deletions of both historical `v*` and current `p2o-v*` tags. It leaves creation available to the manual release workflow.
- The older `v1.0.0`–`v1.0.4` releases are historical snapshots from the previous versioning policy. Keep their links and tags intact; their `1.x` number does not establish stable API or production support for this `0.x` line. The first current-line release should be `p2o-v0.1.0` after the intended Pet Food PRs and demo checks are complete.

## Prepare a release

1. Merge the intended feature PRs into the protected `main` branch. Wait for the `CI` push run on the resulting `main` commit to pass. The release workflow checks that exact commit, so a green PR run alone is insufficient.
2. For releases after `p2o-v0.1.0`, open a preparation PR that updates `VERSION`, `frontend/package.json`, and the two root version fields in `frontend/package-lock.json` together. Summarize user-visible changes, known limitations, migrations, and the Pet Food demo scope in the PR. Merge it through the normal required checks. The first current-line version is already set to `0.1.0` in the release-process PR.
3. After its `main` push CI run is green, check the [Actions → Release](../.github/workflows/release.yml) workflow and choose **Run workflow** on `main`. Enter the version without `v` and select **prerelease** only if it has a suffix such as `-alpha.1`. A maintainer with repository write access must trigger this step.
4. The workflow confirms that the selected commit is still current `main`, all version files match, the tag is new and newer than prior `p2o-v*` tags, and the `CI` push workflow passed on that exact commit. It then creates the tag and published GitHub Release, using generated release notes. The first release notes compare with historical `v1.0.4`; later ones compare with the previous `p2o-v*` tag. Review the published notes and add important migration or limitation details if needed.
5. Verify that the new release's tag points to the `main` commit used by the green CI run. The workflow explicitly marks a normal `0.x` release as GitHub's Latest; a suffix prerelease does not replace Latest.

If a check fails, fix the PR or wait for CI and rerun the release workflow. If a release publication fails after its tag was created, inspect the tag and release in GitHub before retrying; never retarget an existing tag.

## Scope of automation

The Release workflow publishes a Git tag and GitHub Release. It does not deploy a hosted app, publish an npm/PyPI package, build a container registry image, or change the `main` branch. A GitHub-generated source archive is available on the release page.

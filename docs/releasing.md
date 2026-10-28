# Release process

GitHub Releases are versioned snapshots of this repository's runnable Pet Food reference implementation. They are not a production-readiness certification or evidence that the framework works in other domains.

## Version policy

- Use `vMAJOR.MINOR.PATCH` Git tags. The `VERSION` file, `frontend/package.json`, and both root version fields in `frontend/package-lock.json` must contain the same version **without** `v`. The frontend settings screen and FastAPI OpenAPI metadata read those values.
- From the next release onward, use SemVer: `MAJOR` for incompatible changes to documented user-facing contracts, `MINOR` for backward-compatible features, and `PATCH` for compatible fixes or documentation changes. A version such as `1.1.0-alpha.1` is a prerelease and should use the workflow's prerelease checkbox. Build metadata (`+...`) is deliberately not used in release tags.
- Do not rewrite or move an existing tag. Fixes receive a new version. The release workflow requires a version newer than every existing SemVer tag and refuses a reused tag.
- The repository's active **Protect version release tags** ruleset blocks updates and deletions of `v*` tags. It leaves creation available to the manual release workflow.
- The `v1.0.0`–`v1.0.4` tags were created before this policy. `v1.0.4` is a valid historical release, but its `1.x` number should not be read as proof of a stable public API or production support. Keep those links and tags intact. The next feature-bearing Pet Food snapshot should be a **prerelease** (for example `v1.1.0-alpha.1`) until its documented contracts and end-to-end demo are reviewed. Do not use `v1.0.5` for new features.

## Prepare a release

1. Merge the intended feature PRs into the protected `main` branch. Wait for the `CI` push run on the resulting `main` commit to pass. The release workflow checks that exact commit, so a green PR run alone is insufficient.
2. Open a release preparation PR that updates `VERSION`, `frontend/package.json`, and the two root version fields in `frontend/package-lock.json` together. Summarize user-visible changes, known limitations, migrations, and the Pet Food demo scope in the PR. Merge it through the normal required checks.
3. After its `main` push CI run is green, check the [Actions → Release](../.github/workflows/release.yml) workflow and choose **Run workflow** on `main`. Enter the version without `v` and select **prerelease** only if it has a suffix such as `-alpha.1`. A maintainer with repository write access must trigger this step.
4. The workflow confirms that the selected commit is still current `main`, all version files match, the tag is new and newer than prior tags, and the `CI` push workflow passed on that exact commit. It then creates the tag and published GitHub Release, using generated release notes. Review the published notes and add important migration or limitation details if needed.
5. Verify that the new release's tag points to the `main` commit used by the green CI run. For prereleases, GitHub's Latest badge remains on the last stable release.

If a check fails, fix the PR or wait for CI and rerun the release workflow. If a release publication fails after its tag was created, inspect the tag and release in GitHub before retrying; never retarget an existing tag.

## Scope of automation

The Release workflow publishes a Git tag and GitHub Release. It does not deploy a hosted app, publish an npm/PyPI package, build a container registry image, or change the `main` branch. A GitHub-generated source archive is available on the release page.

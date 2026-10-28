# Release process

GitHub Releases are versioned snapshots of this repository's runnable Pet Food reference implementation. They are not a production-readiness certification or evidence that the framework works in other domains.

## Version policy

- The current project line starts at `0.1.0`, with the conventional Git tag `v0.1.0`. `VERSION`, `frontend/package.json`, and both root version fields in `frontend/package-lock.json` contain the version without `v`. The frontend settings screen and FastAPI OpenAPI metadata read those values.
- `0.x` means the public contracts are still evolving. Increase `MINOR` for a meaningful user-facing milestone or compatibility change; increase `PATCH` for compatible fixes. Document any breaking changes in release notes. Use `1.0.0` only after the supported API and file/schema contracts are documented, tested, and treated as stable. A suffix such as `0.2.0-alpha.1` is an additional prerelease stage and must use the workflow's prerelease checkbox. Build metadata (`+...`) is deliberately excluded from release tags.
- Do not rewrite or move an existing tag. Fixes receive a new version. The release workflow requires each new `v0.x` version to exceed prior `v0.x` tags and refuses a reused tag. A future `1.x` version must also exceed the historical `v1.0.4` tag.
- The repository's active **Protect version release tags** ruleset blocks updates and deletions of `v*` tags. It leaves creation available to the manual release workflow.
- The older `v1.0.0`–`v1.0.4` releases are historical snapshots from the previous versioning policy. This one-time reset means the new `0.x` line is numerically below them; keep their links and tags intact. Their `1.x` number does not establish stable API or production support for the current line. Before moving from `0.x` to `1.x`, choose a new, unused version above `1.0.4` and document the compatibility commitment.

## Decide the version for every feature PR

Every PR must select one release impact in the [PR template](../.github/pull_request_template.md). Review that choice before merging. The version is for the whole repository, including the demo UI, backend API, Pet Food schema, and sample-data contract; the frontend package is not released separately.

| Impact | Use when | Example after `v0.1.0` |
| --- | --- | --- |
| None | Documentation, tests, or internal maintenance with no user-visible change | Keep `0.1.0`; no tag for this PR |
| Patch | Compatible fix to existing released behavior, with no new user-facing capability or contract change | `0.1.1` |
| Minor | New feature, meaningful UI/workflow change, or an API/schema/data compatibility change while the project is in `0.x` | `0.2.0` |

For a `0.x` breaking change, choose Minor and document the migration. Do not claim a stable `1.x` contract until it has been defined and tested. A release can include several merged PRs: choose the highest impact since the last tag, summarize all included changes, and create **one** tag for that `main` snapshot. A PR marked None can still be included in the next release snapshot. Do not create tags on feature branches or automatically tag every merge.

The feature PR records the decision; a short release-preparation PR updates the version files when the intended changes are ready to ship. This avoids version conflicts between parallel feature branches. The PR's required `Playwright UI smoke` check runs baseline route and mobile tests on `main`; feature branches should extend it with tests for their own user-visible behavior.

## Prepare a release

1. Record the release impact on each feature PR. Merge the intended PRs into the protected `main` branch. Decide whether to publish now or batch with the next change; if publishing, choose the highest impact since the previous tag.
2. For releases after `v0.1.0`, open a release-preparation PR. Set `VERSION` and both frontend package versions together, for example:

   ```bash
   printf '0.2.0\n' > VERSION
   npm version 0.2.0 --no-git-tag-version --prefix frontend
   python3 scripts/release_version.py 0.2.0 --files-only
   ```

   The first current-line version is already set to `0.1.0`. The CI file check allows unreleased feature PRs to keep that version, but rejects mismatched version files. Summarize user-visible changes, known limitations, migrations, and the Pet Food demo scope in the release-preparation PR. Merge it through the normal required checks.
3. Wait for the `CI` **push** run on the resulting `main` commit to pass. A green PR run alone is insufficient. Check the [Actions → Release](../.github/workflows/release.yml) workflow and choose **Run workflow** on `main`. Enter the version without `v` and select **prerelease** only if it has a suffix such as `-alpha.1`. A maintainer with repository write access must trigger this step.
4. The workflow confirms that the selected commit is still current `main`, all version files match, the tag is new and newer than prior current-line tags, and the `CI` push workflow passed on that exact commit. It then creates the tag and published GitHub Release, using generated release notes. The first release notes compare with historical `v1.0.4`; later ones compare with the previous `v0.x` tag. Review the published notes and add important migration or limitation details if needed.
5. Verify that the new release's tag points to the `main` commit used by the green CI run. The workflow explicitly marks a normal `0.x` release as GitHub's Latest; a suffix prerelease does not replace Latest.

If a check fails, fix the PR or wait for CI and rerun the release workflow. If a release publication fails after its tag was created, inspect the tag and release in GitHub before retrying; never retarget an existing tag.

## Scope of automation

The Release workflow publishes a Git tag and GitHub Release. It does not deploy a hosted app, publish an npm/PyPI package, build a container registry image, or change the `main` branch. A GitHub-generated source archive is available on the release page.

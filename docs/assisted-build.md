# Assisted Build

Use **Data Pipeline → Build with assistant** to upload related source files together and prepare a reviewable import into the existing Pet Food definitions. The manual six-step workflow remains available.

## Design new definitions

Select **Design new schema** in the assisted workspace to propose objects, properties and relationships that the current ontology does not yet describe. The supplier and production-batch example demonstrates this flow without changing runtime data.

1. Describe the concepts and questions to support, then upload related CSV, JSON or NDJSON files. Choose the configured model or the deterministic baseline.
2. Inspect the definition map and open each definition in the right-hand drawer. Review its name, primary key, property types and units, relationship direction and cardinality, and the source columns that support it. Confirm or exclude every proposal. Changes return that definition to pending review.
3. Validate the design and inspect the before/after definition differences. Missing or duplicate identities, invalid bindings, name collisions, excluded endpoints and unconfirmed definitions block saving. A reused definition must preserve the active definition; an extension can add properties while preserving existing fields.
4. Explicitly save the reviewed draft. Download its complete JSON package or individual YAML, mapping and handoff files. Reopening a saved draft retains the exact reviewed revision. Editing invalidates the preview and export until it is validated and saved again.

**A saved design is a draft, not an active ontology.** This flow writes neither checked-in YAML nor graph data. Exported `object_types.yaml` and `link_types.yaml` include the active definitions plus accepted additions. `source_mappings.json` retains candidate-to-column bindings; `schema-design.json` retains the design decisions and source profiles. Integrating this package into runtime schema readers, source mappings and import/query regression is a separate implementation step. Rules, actions and metrics are not generated in this version.

The deterministic baseline proposes conservative string properties, unambiguous identity columns and generic reference relationships from matching keys. Those references do not establish business meaning or referential integrity. Numeric samples do not prove units; identity values must remain unique, nonblank strings, so leading zeroes are preserved. All proposals require human confirmation. Auto mode uses bounded source context and the existing provider configuration; invalid or unavailable model output explicitly falls back to the baseline.

Design tasks are retained under ignored `backend/.runtime/assisted-build/schema_designs/` until deleted from **Design history**. The draft preview is tied to both a revision and the active schema fingerprint; stale previews cannot be saved or exported. Restarted analyses can be retried. This is the same local, single-process storage boundary as assisted imports.

## Build workflow

1. Describe a concrete goal and add CSV, flat JSON arrays, or NDJSON files. Choose the configured model or the deterministic baseline.
2. Inspect the proposed object types, identity columns, field mappings, and relationship endpoints. Edit or exclude mappings and sources. Noncanonical nutrition fields require confirmation that values already use the target per-100-g unit; this version does not convert units.
3. Select **Confirm mappings & preview**. Inspect candidate properties, source rows, existing-object differences, and blocking issues. Cross-file relationship endpoints can refer to other candidates in this build or actual existing runtime nodes.
4. Review the exact preview and explicitly submit it to Review Queue. Approve and apply using the existing queue workflow, then return to verification.
5. **Check runtime graph** compares expected objects, properties and relationships with Neo4j. Graph matching and the review batch's application status are independent: matching previously existing data does not establish that this batch was applied.

Changing mappings invalidates the preview. Submission checks the revision, schema fingerprint and preview hash, and rechecks the live graph. If runtime facts have changed, generate a new preview. Interrupted analysis is marked on backend startup and can be retried from the workspace using its retained uploads. An interrupted submission retains the accepted preview and stable batch identity so retry does not create a second batch. Submitted mappings remain immutable.

## Model behavior

Auto mode uses the existing backend model configuration. The model receives the goal, allowed ontology schema, column names, and up to three sample rows per source. It proposes structured mappings; server code checks allowed types, fields, identities and relationships. Source content is treated as data, not executable instructions.

If the model is unavailable or its proposal is invalid, the task records deterministic fallback. The deterministic baseline uses known schema aliases and endpoint keys; it does not interpret arbitrary goals. Neither mode activates new schema definitions, executes generated code, or writes graph data directly. Changing the source files requires a new task; mapping decisions can be revised within the current task.

## Local storage and limits

- HTTP input accepts up to eight files, each at most 2 MB, with an aggregate backend limit of 8 MiB. The backend also limits rows, columns and cell size.
- Uploaded rows and task snapshots remain under ignored `backend/.runtime/assisted-build/assisted_build/` until the task is deleted. Run responses expose bounded samples and candidates, not complete raw uploads. Credentials are not stored in task records.
- Delete a task through Build history to remove its local upload and run data. Already submitted Review Queue records, including candidate values/provenance, and applied graph data remain.
- Task and Review Queue storage use atomic file replacement and shared in-process locks. This is a single-process local demo, without multi-user authorization or a distributed job runner.
- Read-only runtime verification checks the actual graph, not the checked-in 22-question reference reader. It does not establish general Agent answer accuracy.

## HTTP boundary

`/api/assisted-build` exposes the schema/model status, a public sample-file allowlist, task listing and creation, mapping updates, preview, explicit review submission, runtime verification, interrupted-analysis retry, and task deletion. Creation returns HTTP 202 and performs mapping analysis in the background under a captured model configuration. Invalid inputs return HTTP 400/422; stale revision/schema/preview conflicts return HTTP 409; missing tasks return HTTP 404.

`/api/assisted-build/schema-designs` exposes the separate definition-draft lifecycle: create/list/read, update definitions, preview, explicit save, export, retry and delete. There is no activation or graph-write endpoint. Model calls are not CI dependencies.

## Verification

```sh
PYTHONPATH=backend python -m unittest discover -s backend/tests
```

Run browser regression against a disposable seeded stack with no paid model configured:

```sh
cd frontend
npx playwright test tests/smoke/assisted-build.spec.js --workers=1
```

The browser suite covers renamed multi-file uploads, preserved relationship properties, explicit submission/retry, reload, unit confirmation, missing endpoints, stale local edits, manual workflow access, and fixed controls on desktop/mobile. Live provider calls are separate checks, never a CI dependency.

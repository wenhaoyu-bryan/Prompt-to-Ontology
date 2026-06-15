# Custom CSV Upload

## Why This Exists

The Data Pipeline originally only supported built-in Pet Food sample datasets. Custom CSV Upload proves the system is not hardcoded to sample data — users can bring their own data and map it to the existing ontology schema.

## What It Supports

- Upload a `.csv` file from the browser
- Automatic data profiling (column types, null rates, unique values)
- Field mapping suggestions based on the Pet Food ontology schema
- Manual mapping overrides (change target object type, property, or ignore a column)
- Target object type selection: PetFoodProduct, Ingredient, Brand, RiskRule, Species, LifeStage
- Candidate object generation from CSV rows
- Import Plan creation with custom CSV metadata
- Submission to Review Queue with source metadata preserved
- Apply approved items to the graph
- **Phase 36:** Relationship CSV upload (CONTAINS, MADE_BY, TARGETS_SPECIES, SUITABLE_FOR) — see [Relationship CSV Upload](relationship-csv-upload.md)

## What It Does Not Support Yet

- Relationship CSV upload (CONTAINS, MADE_BY, etc.) — planned for a future phase
- Automatic ID generation from non-ID columns (user must provide an ID column)
- Schema creation from arbitrary data — custom CSV maps to the existing Pet Food ontology only
- Persistent file storage — CSV content is held in backend memory during the session

## Workflow

```text
1. Open Data Pipeline
2. Select "Upload Custom CSV" source mode
3. Drag or click to upload a .csv file
4. Choose target object type (e.g. PetFoodProduct)
5. Review data profile
6. Review field mapping suggestions (override or ignore as needed)
7. Generate Import Plan
8. Submit to Review Queue
9. Approve and apply items
10. Verify in Object Explorer / Graph Explorer
```

## Mapping to Existing Ontology Schema

The system maps CSV columns to properties of existing ontology object types:

| CSV Column | → Object Type | → Property |
|---|---|---|
| product_id | PetFoodProduct | product_id |
| product_name | PetFoodProduct | product_name |
| brand_name | Brand | brand_name |
| species | PetFoodProduct | species |
| fat_100g | PetFoodProduct | fat_100g |

Mapping suggestions are automatic. Users can override or ignore columns in the mapping step.

## Import Plan

Custom CSV Import Plans include metadata:

```json
{
  "source_type": "custom_csv",
  "filename": "my-products.csv",
  "uploaded_at": "2026-06-12T10:00:00"
}
```

This metadata is preserved when the plan is submitted to the Review Queue.

## Review Queue

Review items created from custom CSV include:

- `source_type: "custom_csv"`
- `filename`: original filename
- `source_row_index`: which CSV row the item came from

## Clean Graph Build Mode

Custom CSV is the recommended path for Clean Graph Build Mode:

1. Reset to Clean Graph Build Mode (clears graph instances, keeps schema)
2. Open Data Pipeline → Upload Custom CSV
3. Upload, map, validate, submit to review
4. Approve and apply → graph instances rebuilt from your data

## Known Limitations

- CSV content is held in backend memory; restarting the server clears upload state
- Only object imports are supported; relationship CSV upload is planned for a future phase
- Large CSV files (>10MB) may cause memory pressure — no streaming support yet
- No data deduplication across uploads; duplicate IDs will be merged by Neo4j MERGE semantics

## Example CSV Format

```csv
product_id,product_name,brand_name,species,life_stage,protein_100g,fat_100g,phosphorus_100g,taurine_mg_kg
custom_pf_001,Custom Indoor Cat Formula,ExampleBrand,Cat,Adult,34,18,0.7,1200
custom_pf_002,Custom Senior Cat Formula,ExampleBrand,Cat,Senior,30,16,0.9,900
custom_pf_003,Custom Kitten Formula,ExampleBrand,Cat,Kitten,38,20,0.6,1400
```

## Graph Snapshots

All graph mutations (including custom CSV applies) now generate before/after snapshots. See [Graph Snapshot, Diff & Rollback](graph-snapshot-diff-rollback.md) for details.

# Data Pipeline / Ready Data Workbench

## Why It Exists

Prompt-to-Ontology's runtime story starts with "Ready Data" — but until now, data was assumed to be ready. The Data Pipeline adds the first half of the story:

```
Ready Data → Data Profiling → Field Mapping → Object Preview
→ Relationship Preview → Constraint Validation → Import Plan
```

## Not a Generic ETL Tool

This is a **data-to-ontology workbench**, not a general-purpose ETL platform. Every step is shaped by the ontology schema:

- Profiling infers types that map to `PropertyDef`
- Mapping suggests connections to `ObjectTypeDef` and `LinkTypeDef`
- Validation uses `ontology_kernel.validator` against the schema
- The output is an `ImportPlan`, not a database mutation

## What "Ready Data" Means

Ready data is any tabular dataset (CSV, sample data) that could become ontology objects and links. The pipeline helps you:

1. **Profile** — understand the shape, types, and quality of your data
2. **Map** — connect columns to ontology object properties
3. **Preview** — see candidate objects and links before committing
4. **Validate** — check candidates against schema constraints
5. **Plan** — generate a structured import plan for review

## Pipeline Steps

### Step 1: Data Source
Select a built-in sample or upload CSV. The profiler counts rows, columns, infers types, and shows sample values.

### Step 2: Data Profile
View per-column statistics: type, null rate, unique count, min/max. Understand data quality before mapping.

### Step 3: Field Mapping
The mapper suggests which ontology object type and property each column maps to. Uses exact name matching, known aliases, and fuzzy similarity.

### Step 4: Candidate Preview
Generate candidate `RuntimeObject`s and `RuntimeLink`s from the mapped data. Each candidate includes confidence, evidence, and source row.

### Step 5: Validation
Validate candidates using the Ontology Kernel validator. Check: object type exists, required properties present, link source/target valid, enum values correct.

### Step 6: Import Plan
Generate a structured `ImportPlan` with summary statistics, validation issues, and status. The plan does NOT write to Neo4j.

## Why Import Plan Does Not Write to Graph

In a real ontology runtime, data should go through human review before entering the graph. The Import Plan is the output of the pipeline — the Review Queue (future phase) will allow approval/rejection before import.

## Architecture

```
CSV / Sample Data
    ↓
  Profiler  (profiler.py)
    ↓
  Mapper    (mapper.py)
    ↓
  Transformer  (transformer.py)
    ↓
  Ontology Kernel Validator  (ontology_kernel/validator.py)
    ↓
  Import Plan Generator  (import_plan.py)
    ↓
  Pipeline Service  (service.py)  ←→  API Endpoints  ←→  Frontend
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/pipeline/samples` | List built-in sample sources |
| POST | `/api/pipeline/profile/sample` | Profile a sample dataset |
| POST | `/api/pipeline/profile/csv` | Profile CSV content |
| GET | `/api/pipeline/profile/{source_id}` | Get profiled source |
| POST | `/api/pipeline/mappings/suggest` | Suggest field mappings |
| POST | `/api/pipeline/import-plan` | Create import plan |
| GET | `/api/pipeline/import-plan/{plan_id}` | Get import plan |
| GET | `/api/pipeline/import-plans` | List all import plans |

## Future Phases

- **Phase 29**: Review Queue runtime — submit import plans for human review
- **Phase 30**: Agent as Ontology Operator — agent can trigger pipeline steps
- **Phase 31**: Deployment — Docker packaging for SaaS use

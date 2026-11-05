"""HTTP boundary for the local, reviewable multi-source build workspace."""

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field, ValidationInfo, field_validator

from assisted_build.service import AssistedBuildService
from llm_config_manager import (
    get_active_llm_config,
    get_agent_status,
    get_agent_llm_config,
    llm_config_scope,
)
from ontology_kernel import load_pet_food_schema

ROOT = Path(__file__).resolve().parent.parent
service = AssistedBuildService(
    ROOT, Path(__file__).resolve().parent / ".runtime" / "assisted-build"
)
router = APIRouter(prefix="/api/assisted-build", tags=["Assisted build"])


class SourceInput(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    content: str = Field(max_length=2_666_668)
    sheet: str | None = Field(default=None, min_length=1, max_length=31)
    header_row: int | None = Field(default=None, ge=1, le=100)

    @field_validator("content")
    @classmethod
    def limit_text_content(cls, content: str, info: ValidationInfo) -> str:
        if len(content) > 2_000_000 and not info.data.get("name", "").lower().endswith(".xlsx"):
            raise ValueError("Text sources must be under 2 MB")
        return content


class BuildInput(BaseModel):
    goal: str = Field(min_length=1, max_length=2000)
    files: list[SourceInput] = Field(min_length=1, max_length=8)
    execution_mode: Literal["auto", "deterministic"] = "auto"


class SchemaDesignInput(BuildInput):
    ddl_dialect: Literal["postgres", "mysql"] = "postgres"


class MappingInput(BaseModel):
    expected_revision: int = Field(ge=1)
    sources: list[dict] = Field(min_length=1, max_length=8)


class RevisionInput(BaseModel):
    expected_revision: int = Field(ge=1)


class SubmissionInput(RevisionInput):
    preview_hash: str = Field(min_length=1, max_length=128)


class WorkbookPreviewInput(BaseModel):
    content: str = Field(min_length=1, max_length=2_666_668)
    sheet: str | None = Field(default=None, min_length=1, max_length=31)
    header_row: int = Field(default=1, ge=1, le=100)


def call(operation, *args):
    try:
        return operation(*args)
    except KeyError:
        raise HTTPException(404, "Build task not found")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))


@router.post("/xlsx/preview")
def xlsx_preview(request: WorkbookPreviewInput):
    from assisted_build.xlsx import preview_workbook

    return call(preview_workbook, request.content, request.sheet, request.header_row)


@router.get("/schema")
def schema():
    return {
        "schema": load_pet_food_schema().model_dump(mode="json"),
        "model": get_agent_status("build"),
    }


@router.get("/sample-files")
def sample_files():
    # Exact public allowlist; source filenames never become filesystem paths.
    names = [
        "pet_food_products.csv",
        "pet_food_ingredients.csv",
        "product_ingredients.csv",
    ]
    return {
        "files": [
            {
                "name": name,
                "content": (ROOT / "sample-data" / "pet-food" / name).read_text(),
            }
            for name in names
        ],
        "goal": "Connect these products and ingredients so I can inspect which products contain chicken.",
    }


@router.get("/runs")
def runs():
    return {"runs": service.list_runs()}


def analyze(run_id, config):
    with llm_config_scope(config):
        service.analyze(run_id)


@router.post("/runs", status_code=202)
def create_run(request: BuildInput, background: BackgroundTasks):
    config = call(get_agent_llm_config, "build")
    run = call(
        service.create,
        request.goal.strip(),
        [f.model_dump() for f in request.files],
        request.execution_mode,
    )
    background.add_task(analyze, run["id"], config)
    return run


@router.get("/runs/{run_id}")
def get_run(run_id: str):
    return call(service.get_run, run_id)


@router.put("/runs/{run_id}/mappings")
def mappings(run_id: str, request: MappingInput):
    return call(
        service.update_mappings, run_id, request.expected_revision, request.sources
    )


@router.post("/runs/{run_id}/preview")
def preview(run_id: str, request: RevisionInput):
    return call(service.preview, run_id, request.expected_revision)


@router.post("/runs/{run_id}/submit")
def submit(run_id: str, request: SubmissionInput):
    return call(service.submit, run_id, request.expected_revision, request.preview_hash)


@router.get("/runs/{run_id}/verify")
def verify(run_id: str):
    return call(service.verify, run_id)


@router.delete("/runs/{run_id}")
def delete(run_id: str):
    call(service.delete, run_id)
    return {"deleted": True}


@router.on_event("startup")
def recover_interrupted_builds():
    service.recover_interrupted()


@router.post("/runs/{run_id}/retry", status_code=202)
def retry_run(run_id: str, request: RevisionInput, background: BackgroundTasks):
    config = call(get_agent_llm_config, "build")
    run = call(service.retry, run_id, request.expected_revision)
    background.add_task(analyze, run_id, config)
    return run


# Schema design is a draft-only workspace, separate from import runs.
from assisted_build.schema_design import SchemaDesignService
from assisted_build.ddl_design import is_ddl_filename

schema_design_service = SchemaDesignService(
    ROOT, Path(__file__).resolve().parent / ".runtime" / "assisted-build"
)


class DefinitionsInput(RevisionInput):
    objects: list[dict]
    links: list[dict]


@router.get("/schema-design-sample-files")
def schema_design_sample_files():
    return {
        "goal": "Design supplier and production batch types for these sources.",
        "files": [
            {
                "name": "Supplier.csv",
                "content": "supplier_id,supplier_name,country\nS001,North Foods,CN\nS002,Ocean Foods,US\n",
            },
            {
                "name": "ProductionBatch.csv",
                "content": "batch_id,batch_name,supplier_id\nB001,First,S001\nB002,Second,S001\n",
            },
        ],
    }


@router.get("/schema-designs")
def schema_designs():
    return {"runs": schema_design_service.list_runs()}


def analyze_schema_design(rid, config):
    try:
        with llm_config_scope(config):
            schema_design_service.analyze(rid)
    except Exception:
        schema_design_service.mark_failed(rid)


@router.post("/schema-designs", status_code=202)
def create_schema_design(request: SchemaDesignInput, background: BackgroundTasks):
    ddl_input = any(is_ddl_filename(f.name) for f in request.files)
    mode = request.execution_mode
    if ddl_input and "execution_mode" not in request.model_fields_set:
        mode = "deterministic"
    config = {} if ddl_input and mode == "deterministic" else call(get_agent_llm_config, "build")
    run = call(
        schema_design_service.create,
        request.goal.strip(),
        [f.model_dump() for f in request.files],
        mode,
        request.ddl_dialect,
    )
    background.add_task(analyze_schema_design, run["id"], config)
    return run


@router.get("/schema-designs/{rid}")
def get_schema_design(rid: str):
    return call(schema_design_service.get_run, rid)


@router.put("/schema-designs/{rid}/definitions")
def schema_design_definitions(rid: str, request: DefinitionsInput):
    return call(
        schema_design_service.update,
        rid,
        request.expected_revision,
        request.objects,
        request.links,
    )


@router.post("/schema-designs/{rid}/preview")
def schema_design_preview(rid: str, request: RevisionInput):
    return call(schema_design_service.preview, rid, request.expected_revision)


@router.post("/schema-designs/{rid}/save")
def schema_design_save(rid: str, request: SubmissionInput):
    return call(
        schema_design_service.save, rid, request.expected_revision, request.preview_hash
    )


@router.get("/schema-designs/{rid}/export")
def schema_design_export(rid: str):
    return call(schema_design_service.export, rid)


@router.post("/schema-designs/{rid}/retry", status_code=202)
def schema_design_retry(rid: str, request: RevisionInput, background: BackgroundTasks):
    config = call(get_agent_llm_config, "build")
    run = call(schema_design_service.retry, rid, request.expected_revision)
    background.add_task(analyze_schema_design, rid, config)
    return run


@router.delete("/schema-designs/{rid}")
def schema_design_delete(rid: str):
    call(schema_design_service.delete, rid)
    return {"deleted": True}


@router.on_event("startup")
def recover_interrupted_schema_designs():
    schema_design_service.recover_interrupted()

"""HTTP boundary for the local, reviewable multi-source build workspace."""

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from assisted_build.service import AssistedBuildService
from llm_config_manager import (
    get_active_llm_config,
    get_active_status,
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
    content: str = Field(max_length=2_000_000)


class BuildInput(BaseModel):
    goal: str = Field(min_length=1, max_length=2000)
    files: list[SourceInput] = Field(min_length=1, max_length=8)
    execution_mode: Literal["auto", "deterministic"] = "auto"


class MappingInput(BaseModel):
    expected_revision: int = Field(ge=1)
    sources: list[dict] = Field(min_length=1, max_length=8)


class RevisionInput(BaseModel):
    expected_revision: int = Field(ge=1)


class SubmissionInput(RevisionInput):
    preview_hash: str = Field(min_length=1, max_length=128)


def call(operation, *args):
    try:
        return operation(*args)
    except KeyError:
        raise HTTPException(404, "Build task not found")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))


@router.get("/schema")
def schema():
    return {
        "schema": load_pet_food_schema().model_dump(mode="json"),
        "model": get_active_status(),
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
    run = call(
        service.create,
        request.goal.strip(),
        [f.model_dump() for f in request.files],
        request.execution_mode,
    )
    background.add_task(analyze, run["id"], get_active_llm_config())
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
    run = call(service.retry, run_id, request.expected_revision)
    background.add_task(analyze, run_id, get_active_llm_config())
    return run

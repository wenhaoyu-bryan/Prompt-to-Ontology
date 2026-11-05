from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from ontology_design.models import SaveDefinitions
from ontology_design.service import service


router = APIRouter(prefix="/api/ontology", tags=["Ontology design"])


def _call(operation, *args, **kwargs):
    try:
        return operation(*args, **kwargs)
    except KeyError as exc:
        raise HTTPException(404, "Unknown ontology domain") from exc
    except (ValueError, ValidationError) as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/{domain}/design")
def get_design(domain: str):
    return _call(service.get_catalog, domain)


@router.post("/{domain}/design/definitions")
def save_definitions(domain: str, request: SaveDefinitions):
    return _call(
        service.save_batch, domain, request.expected_revision, request.object_types,
        request.link_types, create_only=request.create_only,
    )

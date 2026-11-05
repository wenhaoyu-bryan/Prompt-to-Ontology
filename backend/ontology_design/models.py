from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool

from ontology_kernel.models import ObjectTypeDef, PropertyDef, LinkTypeDef


Identifier = Annotated[str, Field(pattern=r"^[A-Za-z][A-Za-z0-9_]{0,63}$")]


class DesignProperty(PropertyDef):
    model_config = ConfigDict(extra="forbid")
    name: Identifier
    required: StrictBool = False
    source_bindings: list[dict] = Field(default_factory=list, max_length=32)


class DesignObject(ObjectTypeDef):
    model_config = ConfigDict(extra="forbid")
    name: Identifier
    label: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=4000)
    properties: list[DesignProperty] = Field(min_length=1, max_length=100)
    source_bindings: list[dict] = Field(default_factory=list, max_length=32)


class DesignLink(LinkTypeDef):
    model_config = ConfigDict(extra="forbid")
    name: Identifier
    label: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=4000)
    source_type: Identifier
    target_type: Identifier
    direction: Literal["outgoing", "incoming", "bidirectional"] = "outgoing"
    required: StrictBool = False
    properties: list[DesignProperty] = Field(default_factory=list, max_length=100)
    source_bindings: list[dict] = Field(default_factory=list, max_length=32)


class SaveDefinitions(BaseModel):
    expected_revision: int = Field(ge=1)
    create_only: StrictBool = False
    object_types: list[DesignObject] = Field(default_factory=list, max_length=100)
    link_types: list[DesignLink] = Field(default_factory=list, max_length=100)

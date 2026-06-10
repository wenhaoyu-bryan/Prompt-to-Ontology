"""Mapping Suggestion Engine — suggests field mappings to ontology properties."""

from __future__ import annotations

import re
from typing import Any

from ontology_kernel.models import OntologySchema

from .models import (
    ColumnProfile,
    DataSourceProfile,
    FieldMapping,
    MappingSuggestion,
    MappingType,
    ObjectMapping,
)

# Known aliases for Pet Food demo
_PET_FOOD_ALIASES: dict[str, tuple[str, str]] = {
    "product_id": ("PetFoodProduct", "product_id"),
    "barcode": ("PetFoodProduct", "barcode"),
    "product_name": ("PetFoodProduct", "product_name"),
    "name": ("PetFoodProduct", "product_name"),
    "category": ("PetFoodProduct", "category"),
    "target_species": ("PetFoodProduct", "target_species"),
    "species": ("PetFoodProduct", "target_species"),
    "life_stage": ("PetFoodProduct", "life_stage"),
    "stage": ("PetFoodProduct", "life_stage"),
    "country": ("PetFoodProduct", "country"),
    "protein_100g": ("PetFoodProduct", "protein_100g"),
    "protein": ("PetFoodProduct", "protein_100g"),
    "fat_100g": ("PetFoodProduct", "fat_100g"),
    "fat": ("PetFoodProduct", "fat_100g"),
    "fiber_100g": ("PetFoodProduct", "fiber_100g"),
    "fiber": ("PetFoodProduct", "fiber_100g"),
    "moisture_100g": ("PetFoodProduct", "moisture_100g"),
    "moisture": ("PetFoodProduct", "moisture_100g"),
    "ash_100g": ("PetFoodProduct", "ash_100g"),
    "ash": ("PetFoodProduct", "ash_100g"),
    "phosphorus_100g": ("PetFoodProduct", "phosphorus_100g"),
    "phosphorus": ("PetFoodProduct", "phosphorus_100g"),
    "calcium_100g": ("PetFoodProduct", "calcium_100g"),
    "calcium": ("PetFoodProduct", "calcium_100g"),
    "brand": ("Brand", "brand_name"),
    "brand_name": ("Brand", "brand_name"),
    "brand_id": ("Brand", "brand_id"),
    "ingredient_id": ("Ingredient", "ingredient_id"),
    "ingredient_name": ("Ingredient", "ingredient_name"),
    "ingredient": ("Ingredient", "ingredient_name"),
    "ingredient_type": ("Ingredient", "ingredient_type"),
    "risk_tag": ("Ingredient", "risk_tag"),
    "common_allergen": ("Ingredient", "common_allergen"),
    "species_id": ("Species", "species_id"),
    "species_name": ("Species", "species_name"),
    "stage_id": ("LifeStage", "stage_id"),
    "stage_name": ("LifeStage", "stage_name"),
    "rule_id": ("RiskRule", "rule_id"),
    "rule_name": ("RiskRule", "rule_name"),
    "severity": ("RiskRule", "severity"),
    "explanation": ("RiskRule", "explanation"),
}


def _normalize(name: str) -> str:
    """Normalize column name for matching."""
    return re.sub(r"[^a-z0-9]", "_", name.lower().strip()).strip("_")


def _find_property_in_schema(col_name: str, schema: OntologySchema) -> tuple[str, str, float, str] | None:
    """Try to find a matching property in the schema by name."""
    normalized = _normalize(col_name)

    for type_name, type_def in schema.object_types.items():
        for prop in type_def.properties:
            prop_norm = _normalize(prop.name)
            if normalized == prop_norm:
                return (type_name, prop.name, 1.0, "exact name match")
            # Partial match
            if normalized in prop_norm or prop_norm in normalized:
                return (type_name, prop.name, 0.7, "partial name match")

    return None


def suggest_field_mappings(
    profile: DataSourceProfile,
    schema: OntologySchema,
) -> list[MappingSuggestion]:
    """Suggest field mappings for each column in the profile."""
    suggestions = []

    for col in profile.columns:
        col_lower = col.name.lower().strip()

        # 1. Check known aliases
        if col_lower in _PET_FOOD_ALIASES:
            obj_type, prop = _PET_FOOD_ALIASES[col_lower]
            if obj_type in schema.object_types:
                suggestions.append(MappingSuggestion(
                    source_column=col.name,
                    suggested_object_type=obj_type,
                    suggested_property=prop,
                    confidence=1.0,
                    reason=f"known alias: {col.name} → {obj_type}.{prop}",
                    mapping_type=MappingType.EXACT,
                ))
                continue

        # 2. Schema name match
        match = _find_property_in_schema(col.name, schema)
        if match:
            obj_type, prop, conf, reason = match
            suggestions.append(MappingSuggestion(
                source_column=col.name,
                suggested_object_type=obj_type,
                suggested_property=prop,
                confidence=conf,
                reason=reason,
                mapping_type=MappingType.FUZZY if conf < 1.0 else MappingType.EXACT,
            ))
            continue

        # 3. No match
        suggestions.append(MappingSuggestion(
            source_column=col.name,
            suggested_object_type="",
            suggested_property="",
            confidence=0.0,
            reason="no matching property found in schema",
            mapping_type=MappingType.SUGGESTED,
        ))

    return suggestions


def suggest_object_mappings(
    profile: DataSourceProfile,
    schema: OntologySchema,
) -> tuple[list[ObjectMapping], list[FieldMapping]]:
    """Group field mappings into object mappings."""
    field_suggestions = suggest_field_mappings(profile, schema)

    # Group by target object type
    groups: dict[str, list[MappingSuggestion]] = {}
    unmapped: list[FieldMapping] = []

    for s in field_suggestions:
        if s.suggested_object_type:
            groups.setdefault(s.suggested_object_type, []).append(s)
        else:
            unmapped.append(FieldMapping(
                source_column=s.source_column,
                target_object_type="",
                target_property="",
                confidence=0.0,
                mapping_type=MappingType.SUGGESTED,
                reason=s.reason,
            ))

    object_mappings = []
    for obj_type, suggestions in groups.items():
        if obj_type not in schema.object_types:
            continue

        type_def = schema.object_types[obj_type]

        # Find best id column
        id_col = ""
        display_col = ""
        for s in suggestions:
            if s.suggested_property == type_def.primary_key:
                id_col = s.source_column
            if "name" in s.suggested_property.lower():
                display_col = s.source_column

        if not id_col and suggestions:
            id_col = suggestions[0].source_column
        if not display_col and suggestions:
            display_col = id_col

        field_mappings = [
            FieldMapping(
                source_column=s.source_column,
                target_object_type=obj_type,
                target_property=s.suggested_property,
                confidence=s.confidence,
                mapping_type=s.mapping_type,
                reason=s.reason,
            )
            for s in suggestions
        ]

        avg_conf = sum(s.confidence for s in suggestions) / len(suggestions) if suggestions else 0

        object_mappings.append(ObjectMapping(
            object_type=obj_type,
            id_column=id_col,
            display_name_column=display_col,
            field_mappings=field_mappings,
            confidence=avg_conf,
        ))

    return object_mappings, unmapped

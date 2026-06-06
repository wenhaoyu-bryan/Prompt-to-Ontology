"""Skeleton adapter for Open Pet Food Facts data.

NOT IMPLEMENTED — no network calls. Provides the interface and normalize/to_payload
logic for a single raw product dict (as returned by the OFF API).
"""

from typing import Any

from .adapter_base import PetFoodDataAdapter
from .normalizer import (
    normalize_brand_name,
    normalize_ingredient_name,
    normalize_numeric_value,
    normalize_text_list,
    slugify_id,
)
from .inference import infer_species, infer_life_stage, infer_category


class OpenFoodFactsAdapter(PetFoodDataAdapter):

    # ── Fetch stubs (not implemented) ──

    def fetch_by_barcode(self, barcode: str) -> dict:
        raise NotImplementedError("Open Pet Food Facts API integration not yet implemented")

    def fetch_by_keyword(self, keyword: str, limit: int = 10) -> list[dict]:
        raise NotImplementedError("Open Pet Food Facts API integration not yet implemented")

    # ── Adapter interface ──

    def load(self, source: Any) -> Any:
        """source is expected to be a raw OFF product dict or list of dicts."""
        raise NotImplementedError("Use fetch_by_barcode / fetch_by_keyword once API integration is ready")

    def normalize(self, raw_data: Any) -> Any:
        """Normalize a single raw OFF product dict into a standard intermediate record."""
        if isinstance(raw_data, list):
            return [self._normalize_one(p) for p in raw_data]
        return self._normalize_one(raw_data)

    def to_graph_payload(self, normalized_data: Any) -> dict:
        """Convert normalized records into a Ready Data Contract {nodes, edges} payload."""
        if not isinstance(normalized_data, list):
            normalized_data = [normalized_data]

        nodes: list[dict] = []
        edges: list[dict] = []
        seen_ingredients: set[str] = set()
        seen_brands: set[str] = set()
        seen_species: set[str] = set()
        seen_stages: set[str] = set()

        for rec in normalized_data:
            pid = rec["product_id"]

            # Product node
            nodes.append({
                "id": pid,
                "label": "PetFoodProduct",
                "properties": {
                    "product_name": rec["product_name"],
                    "category": rec["category"],
                    "target_species": rec["species"],
                    "life_stage": rec["life_stage"],
                    **{k: v for k, v in rec["nutrients"].items() if v is not None},
                },
            })

            # Brand
            brand_id = slugify_id("brand", rec["brand"])
            if brand_id not in seen_brands:
                seen_brands.add(brand_id)
                nodes.append({
                    "id": brand_id,
                    "label": "Brand",
                    "properties": {"brand_name": rec["brand"]},
                })
            edges.append({"source": pid, "target": brand_id, "type": "MADE_BY"})

            # Species
            species_id = slugify_id("species", rec["species"])
            if species_id not in seen_species:
                seen_species.add(species_id)
                nodes.append({
                    "id": species_id,
                    "label": "Species",
                    "properties": {"species_name": rec["species"]},
                })
            edges.append({"source": pid, "target": species_id, "type": "TARGETS_SPECIES"})

            # Life stage
            stage_id = slugify_id("stage", rec["life_stage"])
            if stage_id not in seen_stages:
                seen_stages.add(stage_id)
                nodes.append({
                    "id": stage_id,
                    "label": "LifeStage",
                    "properties": {"stage_name": rec["life_stage"]},
                })
            edges.append({"source": pid, "target": stage_id, "type": "SUITABLE_FOR"})

            # Ingredients
            for i, ing_name in enumerate(rec["ingredients"]):
                ing_id = slugify_id("ing", ing_name)
                if ing_id not in seen_ingredients:
                    seen_ingredients.add(ing_id)
                    nodes.append({
                        "id": ing_id,
                        "label": "Ingredient",
                        "properties": {"ingredient_name": ing_name},
                    })
                edges.append({
                    "source": pid,
                    "target": ing_id,
                    "type": "CONTAINS",
                    "properties": {"ingredient_order": i + 1},
                })

        return {"nodes": nodes, "edges": edges}

    # ── Internal ──

    @staticmethod
    def _normalize_one(raw: dict) -> dict:
        product_name = (raw.get("product_name") or "").strip()
        brand = normalize_brand_name(raw.get("brands"))
        categories = normalize_text_list(raw.get("categories", ""))
        ingredients_raw = raw.get("ingredients_text", "")
        ingredients = [normalize_ingredient_name(i) for i in normalize_text_list(ingredients_raw)]

        nutriments = raw.get("nutriments", {})
        nutrients = {
            "proteins_100g": normalize_numeric_value(nutriments.get("proteins_100g")),
            "fat_100g": normalize_numeric_value(nutriments.get("fat_100g")),
            "fiber_100g": normalize_numeric_value(nutriments.get("fiber_100g")),
            "ash_100g": normalize_numeric_value(nutriments.get("ash_100g")),
            "phosphorus_100g": normalize_numeric_value(nutriments.get("phosphorus_100g")),
            "calcium_100g": normalize_numeric_value(nutriments.get("calcium_100g")),
        }

        species = infer_species(product_name, categories)
        life_stage = infer_life_stage(product_name, categories)
        category = infer_category(product_name, categories)

        code = raw.get("code") or slugify_id("off", product_name)
        product_id = f"OFF_{code}" if not str(code).startswith("OFF_") else str(code)

        return {
            "product_id": product_id,
            "product_name": product_name,
            "brand": brand,
            "species": species,
            "life_stage": life_stage,
            "category": category,
            "ingredients": ingredients,
            "nutrients": nutrients,
        }

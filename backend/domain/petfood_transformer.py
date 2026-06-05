"""
Pet Food Transformer — 将 sample CSV 数据转为标准 graph payload。
输出格式: {"nodes": [...], "edges": [...]}
TRIGGERS_RISK 边由 rule_engine 生成，不在本模块内。
"""

import csv
from pathlib import Path
from typing import Any


def _slugify(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def _clean_str(value: str | None) -> str | None:
    if value is None:
        return None
    v = value.strip()
    return v if v else None


def _clean_float(value: str | None) -> float | None:
    if value is None:
        return None
    v = value.strip()
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _clean_int(value: str | None) -> int | None:
    if value is None:
        return None
    v = value.strip()
    if not v:
        return None
    try:
        return int(float(v))
    except ValueError:
        return None


def _load_csv(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"CSV file not found: {path}")
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def transform(data_dir: str | Path) -> dict[str, list]:
    """
    读取 pet-food CSV 目录，输出标准 graph payload。

    Returns:
        {"nodes": [...], "edges": [...]}
    """
    data_dir = Path(data_dir)

    products = _load_csv(data_dir / "pet_food_products.csv")
    ingredients_raw = _load_csv(data_dir / "pet_food_ingredients.csv")
    prod_ings = _load_csv(data_dir / "product_ingredients.csv")
    risk_rules = _load_csv(data_dir / "risk_rules.csv")

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    # ---- 1. Brand 节点 (从 products 去重) ----
    seen_brands: dict[str, str] = {}  # brand_name -> brand_id
    for row in products:
        brand_name = _clean_str(row.get("brand")) or "Unknown Brand"
        if brand_name not in seen_brands:
            brand_id = f"BRAND_{_slugify(brand_name)}"
            seen_brands[brand_name] = brand_id
            nodes.append({
                "id": brand_id,
                "label": "Brand",
                "properties": {
                    "brand_id": brand_id,
                    "brand_name": brand_name,
                    "country": None,
                },
            })

    # ---- 2. PetFoodProduct 节点 ----
    product_ids: set[str] = set()
    for row in products:
        pid = _clean_str(row.get("product_id"))
        if not pid:
            continue
        product_ids.add(pid)
        brand_name = _clean_str(row.get("brand")) or "Unknown Brand"
        brand_id = seen_brands[brand_name]

        nodes.append({
            "id": pid,
            "label": "PetFoodProduct",
            "properties": {
                "product_id": pid,
                "barcode": _clean_str(row.get("barcode")),
                "product_name": _clean_str(row.get("product_name")),
                "category": _clean_str(row.get("category")) or "unknown",
                "target_species": _clean_str(row.get("target_species")) or "unknown",
                "life_stage": _clean_str(row.get("life_stage")) or "unknown",
                "country": _clean_str(row.get("country")),
                "protein_100g": _clean_float(row.get("protein_100g")),
                "fat_100g": _clean_float(row.get("fat_100g")),
                "fiber_100g": _clean_float(row.get("fiber_100g")),
                "moisture_100g": _clean_float(row.get("moisture_100g")),
                "ash_100g": _clean_float(row.get("ash_100g")),
                "phosphorus_100g": _clean_float(row.get("phosphorus_100g")),
                "calcium_100g": _clean_float(row.get("calcium_100g")),
            },
        })

        # MADE_BY 边
        edges.append({
            "source": pid,
            "target": brand_id,
            "type": "MADE_BY",
            "properties": {},
        })

    # ---- 3. Ingredient 节点 ----
    ingredient_names: dict[str, str] = {}  # normalized_name -> ingredient_id
    for row in ingredients_raw:
        iid = _clean_str(row.get("ingredient_id"))
        name = _clean_str(row.get("ingredient_name"))
        if not iid or not name:
            continue
        ingredient_names[name.lower().strip()] = iid
        nodes.append({
            "id": iid,
            "label": "Ingredient",
            "properties": {
                "ingredient_id": iid,
                "ingredient_name": name,
                "ingredient_type": _clean_str(row.get("ingredient_type")),
                "risk_tag": _clean_str(row.get("risk_tag")),
                "common_allergen": _clean_str(row.get("common_allergen")) == "yes",
            },
        })

    # ---- 4. RiskRule 节点 ----
    for row in risk_rules:
        rid = _clean_str(row.get("rule_id"))
        if not rid:
            continue
        nodes.append({
            "id": rid,
            "label": "RiskRule",
            "properties": {
                "rule_id": rid,
                "rule_name": _clean_str(row.get("rule_name")),
                "severity": _clean_str(row.get("severity")) or "medium",
                "explanation": _clean_str(row.get("explanation")),
            },
        })

    # ---- 5. Species 节点 (从 products 去重) ----
    _SPECIES_NAMES = {
        "cat": "Cat",
        "dog": "Dog",
        "cat_or_dog": "Cat or Dog",
        "unknown": "Unknown",
    }
    seen_species: set[str] = set()
    for row in products:
        sp = (_clean_str(row.get("target_species")) or "unknown").lower()
        if sp not in seen_species:
            seen_species.add(sp)
            nodes.append({
                "id": f"SPECIES_{sp}",
                "label": "Species",
                "properties": {
                    "species_id": sp,
                    "species_name": _SPECIES_NAMES.get(sp, sp),
                },
            })

    # ---- 6. LifeStage 节点 (从 products 去重) ----
    _STAGE_NAMES = {
        "kitten": "Kitten",
        "puppy": "Puppy",
        "adult": "Adult",
        "senior": "Senior",
        "all_life_stages": "All Life Stages",
        "unknown": "Unknown",
    }
    seen_stages: set[str] = set()
    for row in products:
        st = (_clean_str(row.get("life_stage")) or "unknown").lower()
        if st not in seen_stages:
            seen_stages.add(st)
            nodes.append({
                "id": f"LIFESTAGE_{st}",
                "label": "LifeStage",
                "properties": {
                    "stage_id": st,
                    "stage_name": _STAGE_NAMES.get(st, st),
                },
            })

    # ---- 7. TARGETS_SPECIES / SUITABLE_FOR 边 ----
    for row in products:
        pid = _clean_str(row.get("product_id"))
        if not pid:
            continue
        sp = (_clean_str(row.get("target_species")) or "unknown").lower()
        edges.append({
            "source": pid,
            "target": f"SPECIES_{sp}",
            "type": "TARGETS_SPECIES",
            "properties": {},
        })
        st = (_clean_str(row.get("life_stage")) or "unknown").lower()
        edges.append({
            "source": pid,
            "target": f"LIFESTAGE_{st}",
            "type": "SUITABLE_FOR",
            "properties": {},
        })

    # ---- 8. CONTAINS 边 ----
    for row in prod_ings:
        pid = _clean_str(row.get("product_id"))
        iid = _clean_str(row.get("ingredient_id"))
        if not pid or not iid:
            continue
        edges.append({
            "source": pid,
            "target": iid,
            "type": "CONTAINS",
            "properties": {
                "ingredient_order": _clean_int(row.get("ingredient_order")),
            },
        })

    return {"nodes": nodes, "edges": edges}


def summarize(payload: dict) -> dict:
    """统计 graph payload 的节点/边分布。"""
    from collections import Counter

    label_counts = Counter(n["label"] for n in payload["nodes"])
    edge_counts = Counter(e["type"] for e in payload["edges"])

    return {
        "total_nodes": len(payload["nodes"]),
        "total_edges": len(payload["edges"]),
        "label_counts": dict(label_counts),
        "edge_type_counts": dict(edge_counts),
    }


if __name__ == "__main__":
    sample_dir = Path(__file__).resolve().parent.parent.parent / "sample-data" / "pet-food"
    payload = transform(sample_dir)
    stats = summarize(payload)

    print(f"Nodes: {stats['total_nodes']}")
    print(f"Edges: {stats['total_edges']}")
    print(f"Label distribution: {stats['label_counts']}")
    print(f"Edge type distribution: {stats['edge_type_counts']}")

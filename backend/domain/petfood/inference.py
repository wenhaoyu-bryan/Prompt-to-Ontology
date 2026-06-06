"""Infer species, life stage, and category from product metadata."""

from .normalizer import normalize_text_list

_SPECIES_CAT = {"cat", "cats", "kitten", "kittens", "feline", "felines"}
_SPECIES_DOG = {"dog", "dogs", "puppy", "puppies", "canine", "canines"}

_LIFE_STAGE_KW = {
    "kitten": "kitten",
    "kittens": "kitten",
    "puppy": "puppy",
    "puppies": "puppy",
    "senior": "senior",
    "mature": "senior",
    "old": "senior",
    "adult": "adult",
    "all life stages": "all_life_stages",
    "all stages": "all_life_stages",
}

_CATEGORY_KW = {
    "dry": "dry_food",
    "kibble": "dry_food",
    "wet": "wet_food",
    "canned": "wet_food",
    "pouch": "wet_food",
    "stew": "wet_food",
    "pâté": "wet_food",
    "pate": "wet_food",
    "treat": "treat",
    "snack": "treat",
    "lickable": "treat",
    "supplement": "supplement",
    "vitamin": "supplement",
}


def infer_species(
    product_name: str = "",
    categories: list[str] | None = None,
    labels: list[str] | None = None,
) -> str:
    cats_labels = set(normalize_text_list(categories or []) + normalize_text_list(labels or []))
    for tok in cats_labels:
        if tok in _SPECIES_CAT:
            return "cat"
        if tok in _SPECIES_DOG:
            return "dog"

    name_lower = product_name.lower()
    for kw in _SPECIES_CAT:
        if kw in name_lower:
            return "cat"
    for kw in _SPECIES_DOG:
        if kw in name_lower:
            return "dog"
    return "unknown"


def infer_life_stage(
    product_name: str = "",
    categories: list[str] | None = None,
    labels: list[str] | None = None,
) -> str:
    combined = normalize_text_list(categories or []) + normalize_text_list(labels or [])
    # Check multi-word keywords first by joining
    joined = " ".join(combined)
    for kw, stage in _LIFE_STAGE_KW.items():
        if kw in joined:
            return stage

    name_lower = product_name.lower()
    for kw, stage in _LIFE_STAGE_KW.items():
        if kw in name_lower:
            return stage
    return "unknown"


def infer_category(
    product_name: str = "",
    categories: list[str] | None = None,
) -> str:
    cats = normalize_text_list(categories or [])
    for tok in cats:
        for kw, cat in _CATEGORY_KW.items():
            if kw in tok:
                return cat

    name_lower = product_name.lower()
    for kw, cat in _CATEGORY_KW.items():
        if kw in name_lower:
            return cat
    return "unknown"

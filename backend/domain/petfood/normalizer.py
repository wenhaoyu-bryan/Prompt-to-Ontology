"""Normalization helpers for raw pet food data fields."""

import re


def normalize_brand_name(value: str | None) -> str:
    if not value or not value.strip():
        return "Unknown Brand"
    return value.strip()


def normalize_ingredient_name(value: str | None) -> str:
    if not value or not value.strip():
        return ""
    return value.strip().lower()


def normalize_category(value: str | None) -> str:
    if not value or not value.strip():
        return ""
    return value.strip().lower()


def normalize_barcode(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", "", str(value))
    return cleaned or None


def normalize_numeric_value(value) -> float | None:
    if value is None:
        return None
    try:
        v = float(value)
        return v
    except (ValueError, TypeError):
        return None


def normalize_text_list(value) -> list[str]:
    """Split a comma/semicolon-separated string into a clean list."""
    if not value:
        return []
    if isinstance(value, list):
        return [v.strip().lower() for v in value if v.strip()]
    parts = re.split(r"[,;]+", str(value))
    return [p.strip().lower() for p in parts if p.strip()]


def slugify_id(prefix: str, value: str) -> str:
    """Create a stable ID from a prefix and a name/value string."""
    slug = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return f"{prefix}_{slug}" if slug else prefix

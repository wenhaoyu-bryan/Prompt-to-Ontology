"""Schema-driven conversion for tabular import values."""

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import math
from typing import Any

from ontology_kernel.models import PropertyType


def requires_per_100g_confirmation(source_column: str, target_property: str) -> bool:
    return target_property.endswith("_100g") and source_column != target_property


def coerce_property(value: Any, property_type: PropertyType) -> Any:
    if property_type == PropertyType.NUMBER:
        if isinstance(value, bool):
            raise ValueError("Expected a number")
        number = float(value)
        if not math.isfinite(number):
            raise ValueError("Expected a finite number")
        return number
    if property_type == PropertyType.INTEGER:
        try:
            number = Decimal(str(value))
        except InvalidOperation as exc:
            raise ValueError("Expected an integer") from exc
        if not number.is_finite() or not -(2**63) <= number < 2**63 or number != number.to_integral_value():
            raise ValueError("Expected a signed 64-bit integer")
        return int(number)
    if property_type == PropertyType.BOOLEAN:
        text = str(value).strip().lower()
        if text not in ("true", "false"):
            raise ValueError("Expected true or false")
        return text == "true"
    if property_type in (PropertyType.LIST, PropertyType.OBJECT):
        raise ValueError("Nested values are unsupported for tabular import")
    text = str(value)
    if property_type == PropertyType.DATE:
        date.fromisoformat(text)
    elif property_type == PropertyType.DATETIME:
        datetime.fromisoformat(text)
    return text


def coerce_link_property(link_type: str, target_property: str, value: Any) -> Any:
    if link_type == "CONTAINS" and target_property == "ingredient_order":
        number = coerce_property(value, PropertyType.INTEGER)
        if number < 1:
            raise ValueError("Ingredient order starts at 1")
        return number
    if link_type == "CONTAINS" and target_property == "proportion_percent":
        number = coerce_property(value, PropertyType.NUMBER)
        if not 0 <= number <= 100:
            raise ValueError("Proportion must be between 0 and 100 percent")
        return number
    return value

"""Adapter that wraps the existing CSV sample-data transformer."""

from pathlib import Path
from typing import Any

from .adapter_base import PetFoodDataAdapter


class SampleCSVAdapter(PetFoodDataAdapter):
    """Wraps petfood_transformer.transform() into the adapter interface."""

    def load(self, source: Any) -> Any:
        """source should be a Path to the sample-data/pet-food directory."""
        return source

    def normalize(self, raw_data: Any) -> Any:
        """No normalization needed — CSVs are already clean."""
        return raw_data

    def to_graph_payload(self, normalized_data: Any) -> dict:
        """Delegate to the existing transformer."""
        from ..petfood_transformer import transform
        return transform(normalized_data)

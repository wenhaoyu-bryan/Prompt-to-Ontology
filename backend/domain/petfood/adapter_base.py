"""Abstract base for pet food data adapters."""

from abc import ABC, abstractmethod
from typing import Any


class PetFoodDataAdapter(ABC):
    """Adapters convert external data sources into a Ready Data Contract payload."""

    @abstractmethod
    def load(self, source: Any) -> Any:
        """Load raw data from a source (directory, API response, etc.)."""

    @abstractmethod
    def normalize(self, raw_data: Any) -> Any:
        """Normalize raw data into intermediate product records."""

    @abstractmethod
    def to_graph_payload(self, normalized_data: Any) -> dict:
        """Convert normalized records into Ready Data Contract graph payload."""

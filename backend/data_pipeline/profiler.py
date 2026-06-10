"""Data Profiler — profiles CSV / tabular data into DataSourceProfile."""

from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Any

from .models import ColumnProfile, DataSourceProfile, InferredType


def _infer_type(values: list[Any]) -> InferredType:
    """Infer column type from non-null sample values."""
    non_null = [v for v in values if v is not None and str(v).strip() != ""]
    if not non_null:
        return InferredType.UNKNOWN

    # Try integer
    int_count = 0
    for v in non_null[:20]:
        try:
            int(str(v))
            int_count += 1
        except (ValueError, TypeError):
            pass
    if int_count == len(non_null[:20]):
        return InferredType.INTEGER

    # Try number
    num_count = 0
    for v in non_null[:20]:
        try:
            float(str(v))
            num_count += 1
        except (ValueError, TypeError):
            pass
    if num_count == len(non_null[:20]):
        return InferredType.NUMBER

    # Try boolean
    bool_values = {"true", "false", "yes", "no", "1", "0"}
    if all(str(v).lower().strip() in bool_values for v in non_null[:20]):
        return InferredType.BOOLEAN

    return InferredType.STRING


def _profile_column(name: str, values: list[Any]) -> ColumnProfile:
    """Profile a single column."""
    total = len(values)
    null_count = sum(1 for v in values if v is None or str(v).strip() == "")
    non_null = [v for v in values if v is not None and str(v).strip() != ""]
    unique_count = len(set(str(v) for v in non_null))

    inferred_type = _infer_type(non_null)
    sample_values = list(dict.fromkeys(str(v) for v in non_null[:5]))

    min_val = None
    max_val = None
    if inferred_type in (InferredType.NUMBER, InferredType.INTEGER):
        try:
            nums = [float(v) for v in non_null]
            min_val = min(nums)
            max_val = max(nums)
        except (ValueError, TypeError):
            pass

    return ColumnProfile(
        name=name,
        inferred_type=inferred_type,
        null_count=null_count,
        null_rate=null_count / total if total > 0 else 0.0,
        unique_count=unique_count,
        sample_values=sample_values,
        min_value=min_val,
        max_value=max_val,
    )


def profile_rows(rows: list[dict[str, Any]], source_name: str) -> DataSourceProfile:
    """Profile a list of dicts into a DataSourceProfile."""
    if not rows:
        return DataSourceProfile(source_id=source_name, source_name=source_name, row_count=0, column_count=0)

    columns_raw: dict[str, list[Any]] = {}
    for row in rows:
        for key in row:
            if key not in columns_raw:
                columns_raw[key] = []
            columns_raw[key].append(row.get(key))

    columns = [_profile_column(name, values) for name, values in columns_raw.items()]

    return DataSourceProfile(
        source_id=source_name,
        source_name=source_name,
        source_type="rows",
        row_count=len(rows),
        column_count=len(columns),
        columns=columns,
        sample_rows=rows[:5],
    )


def profile_csv(file_path: str, source_name: str | None = None) -> DataSourceProfile:
    """Profile a CSV file."""
    path = Path(file_path)
    name = source_name or path.stem

    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    return profile_rows(rows, name)


def profile_csv_content(content: str, filename: str) -> DataSourceProfile:
    """Profile CSV content from a string."""
    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    return profile_rows(rows, filename)

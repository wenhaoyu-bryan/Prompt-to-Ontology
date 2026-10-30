import csv
import hashlib
import io
from data_pipeline.profiler import profile_rows, parse_structured_rows

MAX_BYTES = 2 * 1024 * 1024
MAX_TOTAL_BYTES = 8 * 1024 * 1024
MAX_ROWS = 10000


def parse_sources(files):
    sources = []
    allrows = {}
    total = 0
    for n, f in enumerate(files):
        content = f.get("content")
        name = f.get("name", "source")
        if not isinstance(content, str) or not isinstance(name, str) or len(name) > 255:
            raise ValueError("Invalid source")
        size = len(content.encode())
        total += size
        if size > MAX_BYTES or total > MAX_TOTAL_BYTES:
            raise ValueError("Upload size limit exceeded")
        content = content.lstrip("\ufeff")
        stripped = content.lstrip()
        if stripped.startswith("["):
            fmt = "json"
            rows = parse_structured_rows(content, fmt)
        elif stripped.startswith("{"):
            fmt = "ndjson"
            rows = parse_structured_rows(content, fmt)
        else:
            fmt = "csv"
            reader = csv.DictReader(io.StringIO(content))
            fields = reader.fieldnames or []
            if (
                not fields
                or len(set(fields)) != len(fields)
                or any(not x for x in fields)
            ):
                raise ValueError("Unique non-empty CSV headers required")
            rows = []
            for row in reader:
                if None in row or any(v is None for v in row.values()):
                    raise ValueError("CSV row width mismatch")
                rows.append(row)
                if len(rows) > MAX_ROWS:
                    raise ValueError("Row limit exceeded")
        if not rows or len(rows) > MAX_ROWS or len(rows[0]) > 100:
            raise ValueError("Expected 1 to 10000 rows and at most 100 columns")
        if any(len(str(v)) > 10000 for row in rows for v in row.values()):
            raise ValueError("Cell limit exceeded")
        sid = f"source-{n+1}"
        profile = profile_rows(rows, sid)
        sources.append(
            {
                "id": sid,
                "name": name,
                "format": fmt,
                "content_hash": hashlib.sha256(content.encode()).hexdigest(),
                "row_count": len(rows),
                "columns": [x.model_dump(mode="json") for x in profile.columns],
                "sample_rows": rows[:5],
                "object_mappings": [],
                "link_mappings": [],
                "excluded": False,
                "unit_confirmations": {},
            }
        )
        allrows[sid] = rows
    return sources, allrows

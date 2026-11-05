"""Read a bounded worksheet as plain records without evaluating formulas."""

import base64
import binascii
from io import BytesIO
from zipfile import BadZipFile, ZipFile

from openpyxl import load_workbook


MAX_WORKBOOK_BYTES = 2_000_000
MAX_HEADER_ROW = 100
MAX_ROWS = 10_000
MAX_COLUMNS = 100
PREVIEW_ROWS = 10


class WorksheetError(ValueError):
    """The user can choose another sheet or header row."""


def decode_workbook(content: str) -> bytes:
    if len(content) > 2_666_668:
        raise ValueError("XLSX file must be at most 2 MB")
    try:
        data = base64.b64decode(content, validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("Invalid XLSX file encoding") from None
    if not data or len(data) > MAX_WORKBOOK_BYTES:
        raise ValueError("XLSX file must contain data and be at most 2 MB")
    return data


def _open_workbook(data):
    try:
        with ZipFile(BytesIO(data)) as archive:
            entries = archive.infolist()
            if (
                len(entries) > 256
                or len(set(archive.namelist())) != len(entries)
                or sum(entry.file_size for entry in entries) > 32 * 1024 * 1024
            ):
                raise ValueError("XLSX expanded size or package limit exceeded")
    except BadZipFile:
        raise ValueError("Invalid XLSX workbook") from None
    try:
        return load_workbook(BytesIO(data), read_only=True, data_only=False, keep_links=False)
    except Exception:
        raise ValueError("Invalid XLSX workbook") from None


def _cell_text(cell, row):
    value = cell.value
    if value is None:
        return ""
    if cell.data_type in {"f", "e"}:
        raise WorksheetError(f"Excel row {row} contains a formula or cell error. Use values only.")
    if isinstance(value, bool):
        return str(value).lower()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    text = str(value)
    if len(text) > 10_000:
        raise WorksheetError(f"Excel row {row} contains a cell exceeding 10,000 characters")
    return text


def _read_rows(worksheet, header_row):
    # Dimensions in XLSX are advisory. Stream actual rows so a wrong dimension
    # cannot silently omit data, and stop before large blank spans expand.
    worksheet.reset_dimensions()
    columns, rows, row_numbers = [], [], []
    text_bytes = 0
    for number, cells in enumerate(worksheet.iter_rows(min_row=header_row), header_row):
        if number > header_row + MAX_ROWS:
            raise WorksheetError("Worksheet exceeds the 10,000-row range after the header")
        used_columns = max((i for i, cell in enumerate(cells, 1) if cell.value is not None), default=0)
        if used_columns > MAX_COLUMNS:
            raise WorksheetError(f"Excel row {number} exceeds the 100-column limit")
        if number == header_row:
            columns = [_cell_text(cell, number).strip() for cell in cells[:used_columns]]
            if not columns or any(not col for col in columns) or len(set(columns)) != len(columns):
                raise WorksheetError("Choose a header row with unique, non-empty column names")
        elif used_columns:
            if used_columns > len(columns):
                raise WorksheetError(f"Excel row {number} has values outside the selected header columns")
            values = [_cell_text(cell, number) for cell in cells[:len(columns)]]
            text_bytes += sum(len(value.encode()) for value in values)
            if text_bytes > 8 * 1024 * 1024:
                raise WorksheetError("Worksheet text exceeds the 8 MiB limit")
            rows.append(values + [""] * (len(columns) - len(values)))
            row_numbers.append(number)
    if not rows:
        raise WorksheetError("No records were found below the selected header row")
    return {"columns": columns, "rows": rows, "row_numbers": row_numbers}


def read_worksheet(data: bytes, sheet: str | None, header_row: int) -> dict:
    if type(header_row) is not int or not 1 <= header_row <= MAX_HEADER_ROW:
        raise ValueError(f"Choose a header row between 1 and {MAX_HEADER_ROW}")
    workbook = _open_workbook(data)
    try:
        worksheets = {ws.title: ws for ws in workbook.worksheets}
        if not worksheets or len(worksheets) > 64:
            raise ValueError("Expected a workbook with 1 to 64 worksheets")
        sheet = sheet if sheet is not None else next(iter(worksheets))
        if sheet not in worksheets:
            raise ValueError("Worksheet not found")
        result = {"sheets": list(worksheets), "sheet": sheet, "header_row": header_row, "error": None}
        try:
            return {**result, **_read_rows(worksheets[sheet], header_row)}
        except WorksheetError as exc:
            return {**result, "columns": [], "rows": [], "row_numbers": [], "error": str(exc)}
        except Exception:
            raise ValueError("Invalid XLSX worksheet") from None
    finally:
        workbook.close()


def preview_workbook(content, sheet, header_row):
    result = read_worksheet(decode_workbook(content), sheet, header_row)
    return {
        **result,
        "rows": result["rows"][:PREVIEW_ROWS],
        "row_numbers": result["row_numbers"][:PREVIEW_ROWS],
        "row_count": len(result["rows"]),
    }

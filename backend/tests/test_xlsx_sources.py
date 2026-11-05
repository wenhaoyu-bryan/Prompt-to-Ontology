import base64
import unittest
from io import BytesIO
from pathlib import Path

from openpyxl import Workbook

from assisted_build.sources import parse_sources
from assisted_build.xlsx import preview_workbook


class XlsxSourcesTests(unittest.TestCase):
    def test_original_workbook_keeps_selected_sheet_header_and_row(self):
        workbook = Path(__file__).resolve().parents[2] / "frontend/tests/fixtures/product-import.xlsx"
        sources, rows = parse_sources([{
            "name": "products.xlsx", "content": base64.b64encode(workbook.read_bytes()).decode(),
            "sheet": "Products", "header_row": 2,
        }], allow_xlsx=True)
        source, = sources
        self.assertEqual(source["format"], "xlsx")
        self.assertEqual(source["sheet"], "Products")
        self.assertEqual(source["row_numbers"], [4])
        self.assertEqual(rows[source["id"]][0]["product_id"], "000981")

    def test_invalid_sheet_selection_does_not_admit_formulas(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["product_id", "product_name"])
        sheet.append(["000981", "=1+1"])
        stream = BytesIO()
        workbook.save(stream)
        workbook.close()
        content = base64.b64encode(stream.getvalue()).decode()
        preview = preview_workbook(content, None, 1)
        self.assertEqual(preview["sheets"], ["Sheet"])
        self.assertIn("formula", preview["error"])
        self.assertEqual(preview["rows"], [])
        with self.assertRaisesRegex(ValueError, "formula"):
            parse_sources([{
                "name": "formula.xlsx", "content": content, "sheet": "Sheet", "header_row": 1,
            }], allow_xlsx=True)

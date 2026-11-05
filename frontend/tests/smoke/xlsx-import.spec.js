import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

test("selects an XLSX worksheet and header, previews rows and keeps text IDs", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pto-auth", JSON.stringify({ username: "demo", name: "Demo User" }));
    localStorage.setItem("i18nextLng", "en");
  });
  await page.goto("/pipeline?mode=assisted");
  await page.getByRole("textbox", { name: "Build goal", exact: true }).fill("Map the product workbook");
  await page.getByRole("combobox", { name: "Mapping execution mode" }).click();
  await page.getByText("Deterministic baseline · no model call", { exact: true }).filter({ visible: true }).click();
  await page.locator("input[type=file]").setInputFiles(fileURLToPath(new URL("../fixtures/product-import.xlsx", import.meta.url)));
  await page.getByRole("button", { name: "Choose worksheet" }).click();
  const picker = page.getByRole("dialog", { name: "Configure workbook" });
  await picker.getByRole("combobox", { name: "Worksheet" }).click();
  await page.getByText("Products", { exact: true }).filter({ visible: true }).click();
  await picker.getByRole("spinbutton", { name: "Header row" }).fill("2");
  await picker.getByRole("button", { name: "Preview worksheet" }).click();
  await expect(picker.getByRole("columnheader", { name: "product_id" })).toBeVisible();
  await expect(picker.getByRole("cell", { name: "000981", exact: true })).toBeVisible();
  await expect(picker.getByRole("cell", { name: "4", exact: true })).toBeVisible();
  await picker.getByRole("button", { name: "Use worksheet" }).click();
  await page.getByRole("button", { name: /Analyze files/ }).click();
  const preview = page.waitForResponse((r) => r.url().endsWith("/preview") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Confirm mappings & preview" }).click();
  const response = await preview;
  expect(response.ok()).toBeTruthy();
  const run = await response.json();
  expect(run.preview.summary.errors).toBe(0);
  expect(run.preview.objects[0].id).toBe("000981");
  expect(run.preview.objects[0].source_row).toBe(4);
  await page.getByRole("row").filter({ hasText: "000981" }).getByRole("button", { name: "View", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Candidate details" })).toContainText("Products · Excel row 4");
});

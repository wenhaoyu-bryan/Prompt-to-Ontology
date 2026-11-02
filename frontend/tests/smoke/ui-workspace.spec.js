import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "pto-auth",
      JSON.stringify({ username: "demo", name: "Demo User" }),
    );
    localStorage.setItem("pto-lang", "en");
  });
});

test("brand is readable, local and shared by login, sidebar and favicon", async ({
  page,
  request,
}) => {
  await page.goto("/dashboard");
  const logo = page.locator(".sidebar-brand .app-logo img");
  await expect(logo).toBeVisible();
  await expect
    .poll(() =>
      logo.evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBeTruthy();
  await expect(logo).toHaveAttribute("src", "/brand/ontology-reasoning.png");
  const favicon = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(favicon).not.toContain("data:");
  expect((await request.get(favicon)).ok()).toBeTruthy();
  await page.goto("/login");
  await expect(page.locator(".login-logo img")).toHaveAttribute(
    "src",
    "/brand/ontology-reasoning.png",
  );
});

test("build opens assistance first and retains a keyboard-accessible manual workflow", async ({
  page,
}) => {
  await page.goto("/pipeline");
  await expect(page.getByTestId("assisted-build")).toBeVisible();
  await expect(
    page.locator('.build-navigation [aria-current="page"]'),
  ).toHaveCount(1);
  await page
    .getByRole("link", { name: "Manual configuration", exact: true })
    .click();
  await expect(page).toHaveURL(/mode=manual/);
  const source = page
    .locator(".pipeline-source-card")
    .filter({ hasText: "pet_food_products" });
  await source.focus();
  await source.press("Space");
  await expect(source).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(".pipeline-step-footer button").last(),
  ).toBeEnabled();
});

test("object filters are keyboard controls without decorative emoji", async ({
  page,
}) => {
  await page.goto("/objects");
  const brand = page.getByRole("button", { name: /Brand/ }).first();
  await brand.focus();
  await brand.press("Enter");
  await expect(brand).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".ant-table-tbody .ant-table-row")).toHaveCount(3);
  expect(await page.locator("main").innerText()).not.toMatch(
    /\p{Extended_Pictographic}/u,
  );
});

test("review queue zero does not assert that all rules passed", async ({
  page,
}) => {
  await page.route("**/api/review/summary", (route) =>
    route.fulfill({ json: { total: 0, pending: 0, applied: 0, failed: 0 } }),
  );
  await page.goto("/dashboard");
  await expect(page.locator(".stat-item").first()).toBeVisible();
  await expect(page.getByText(/all rules are passing/i)).toHaveCount(0);
  await expect(page.locator(".stat-strip")).toContainText("0");
  await expect(page.locator(".ant-progress")).toHaveCount(0);
});

test("a failed graph fetch stays unknown while available schema counts remain readable", async ({
  page,
}) => {
  await page.route("**/api/graph", (route) =>
    route.fulfill({ status: 503, json: { detail: "Temporary test failure" } }),
  );
  await page.goto("/dashboard");
  await expect(page.locator(".stat-item").first()).toContainText("—");
  await expect(page.locator(".stat-item").nth(1)).toContainText("—");
  await expect(page.locator(".stat-item").nth(2)).toContainText("5");
});

test("schema calibration starts with readable definitions above the fixed action bar", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/assisted-build/schema-designs", {
    data: {
      goal: "Describe supplier records",
      files: [
        {
          name: "Supplier.csv",
          content: "supplier_id,supplier_name\nS901,North\nS902,South\n",
        },
      ],
      execution_mode: "deterministic",
    },
  });
  expect(response.status()).toBe(202);
  const run = await response.json();
  await page.goto(`/pipeline?mode=schema&design=${run.id}`);
  await expect(
    page.getByRole("button", { name: "View & edit", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Proposed schema map" }),
  ).toHaveCount(0);
  const row = await page
    .locator(".ant-table-tbody .ant-table-row")
    .first()
    .boundingBox();
  const footer = await page.locator(".ab-footer").boundingBox();
  expect(row.y + row.height).toBeLessThan(footer.y);
  await page.getByText("Schema map", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Proposed schema map" }),
  ).toBeVisible();
  await request.delete(`/api/assisted-build/schema-designs/${run.id}`);
});

test("clicking the active import tab retains its task and unsaved mapping decisions", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/assisted-build/runs", {
    data: {
      goal: "Inspect new product records",
      files: [
        {
          name: "catalog.csv",
          content:
            "product_id,product_name\nPF992201,North food\nPF992202,South food\n",
        },
      ],
      execution_mode: "deterministic",
    },
  });
  const run = await response.json();
  try {
    await page.goto(`/pipeline?mode=assisted&run=${run.id}`);
    await page
      .getByRole("checkbox", { name: "Exclude this file", exact: true })
      .check();
    await page.getByRole("link", { name: "Import data", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`run=${run.id}`));
    await expect(
      page.getByRole("checkbox", { name: "Exclude this file", exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole("button", { name: "Confirm mappings & preview" }),
    ).toBeVisible();
  } finally {
    await request.delete(`/api/assisted-build/runs/${run.id}`);
  }
});

test("clicking the active schema tab retains unsaved definition edits", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/assisted-build/schema-designs", {
    data: {
      goal: "Describe supplier records",
      files: [
        {
          name: "Supplier.csv",
          content: "supplier_id,supplier_name\nS971,North\nS972,South\n",
        },
      ],
      execution_mode: "deterministic",
    },
  });
  const run = await response.json();
  try {
    await page.goto(`/pipeline?mode=schema&design=${run.id}`);
    await page
      .getByRole("button", { name: "View & edit", exact: true })
      .click();
    await page
      .getByLabel("Description", { exact: true })
      .fill("Unsaved business meaning");
    await page
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    await page
      .getByRole("link", { name: "Design schema draft", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`design=${run.id}`));
    await page
      .getByRole("button", { name: "View & edit", exact: true })
      .click();
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
      "Unsaved business meaning",
    );
  } finally {
    await request.delete(`/api/assisted-build/schema-designs/${run.id}`);
  }
});

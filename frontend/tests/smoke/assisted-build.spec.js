import { test, expect } from "@playwright/test";
const product = "product_id,product_name\nPF991001,Build test food\n";
const ingredient =
  "ingredient_id,ingredient_name\nING991001,build smoke ingredient\n";
const relation =
  "product_id,ingredient_id,ingredient_order\nPF991001,ING991001,1\n";
const file = (name, content) => ({
  name,
  mimeType: "text/csv",
  buffer: Buffer.from(content),
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "pto-auth",
      JSON.stringify({ username: "demo", name: "Demo User" }),
    );
    localStorage.setItem("i18nextLng", "en");
    localStorage.setItem("pto-theme-mode", "dark");
  });
});
async function upload(page, files) {
  await page.goto("/pipeline?mode=assisted");
  await page
    .getByRole("textbox", { name: "Build goal", exact: true })
    .fill("Connect uploaded products and ingredients");
  await page.getByRole("combobox", { name: "Mapping execution mode" }).click();
  await page
    .getByText("Deterministic baseline · no model call", { exact: true })
    .last()
    .click();
  await page.locator("input[type=file]").setInputFiles(files);
  await expect(page.locator(".ab-file")).toHaveCount(files.length);
  await page
    .getByRole("button", { name: "rocket Analyze files", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm mappings & preview" }),
  ).toBeVisible();
  await expect(page.locator(".ab-loading")).toHaveCount(0);
  return new URL(page.url()).searchParams.get("run");
}
async function preview(page) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/preview") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Confirm mappings & preview" })
    .click();
  const result = await response;
  expect(result.ok()).toBeTruthy();
  return result.json();
}
test("renamed multi-file upload preserves properties, submits once and reopens without runtime errors", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = await upload(page, [
    file("new-catalog.csv", product),
    file("components.csv", ingredient),
    file("join-table.csv", relation),
  ]);
  const built = await preview(page);
  expect(built.preview.summary.errors).toBe(0);
  expect(built.preview.objects).toHaveLength(2);
  expect(built.preview.links).toHaveLength(1);
  expect(built.preview.links[0].properties.ingredient_order).toBe(1);
  await page.getByRole("button", { name: /Review build plan/ }).click();
  await page.getByRole("checkbox", { name: /I reviewed the mappings/ }).check();
  const submission = page.waitForResponse(
    (r) => r.url().endsWith("/submit") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Submit to Review Queue", exact: true })
    .click();
  expect((await submission).ok()).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: "Your build is in Review Queue" }),
  ).toBeVisible();
  const saved = await (
    await request.get(`/api/assisted-build/runs/${id}`)
  ).json();
  const retry = await request.post(`/api/assisted-build/runs/${id}/submit`, {
    data: {
      expected_revision: saved.revision,
      preview_hash: saved.preview.hash,
    },
  });
  expect((await retry.json()).review_batch_id).toBe(saved.review_batch_id);
  expect(
    (await (await request.get(`/api/assisted-build/runs/${id}/verify`)).json())
      .applied,
  ).toBe(false);
  const itemsResponse = await request.get("/api/review/items", {
    params: { batch_id: saved.review_batch_id },
  });
  const { items } = await itemsResponse.json();
  const candidates = items.filter((item) =>
    item.type.toLowerCase().startsWith("import_"),
  );
  expect(candidates).toHaveLength(3);
  for (const item of candidates) {
    const approval = await request.post(
      `/api/review/items/${item.id}/approve`,
      {
        data: {
          reason: "Disposable browser regression",
          reviewed_by: "smoke_test",
        },
      },
    );
    expect(approval.ok()).toBeTruthy();
  }
  const appliedResponse = await request.post(
    `/api/review/batches/${saved.review_batch_id}/apply-approved`,
  );
  expect(appliedResponse.ok()).toBeTruthy();
  expect((await appliedResponse.json()).applied).toBe(3);
  const afterApply = await (
    await request.get(`/api/assisted-build/runs/${id}/verify`)
  ).json();
  expect(afterApply.graph_matched).toBe(true);
  expect(afterApply.applied).toBe(true);
  const query = await request.post("/api/pet-food/agent/chat", {
    data: {
      question: "Explain PF991001 risks",
      context: { execution_mode: "deterministic" },
    },
  });
  expect(query.ok()).toBeTruthy();
  const answer = await query.json();
  expect(answer.tool_results[0].data.ingredients).toContain(
    "build smoke ingredient",
  );
  await page.reload();
  await page.getByRole("button", { name: /Review$/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your build is in Review Queue" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("ambiguous nutrient units block until explicitly confirmed", async ({
  page,
}) => {
  await upload(page, [
    file(
      "nutrition.csv",
      "product_id,product_name,protein\nPF991002,Unit test,31\n",
    ),
  ]);
  let built = await preview(page);
  expect(
    built.preview.issues.some((i) => i.code === "UNIT_CONFIRMATION_REQUIRED"),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: /Review build plan/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Mappings$/ }).click();
  await page
    .getByRole("checkbox", { name: "Confirm unit protein", exact: true })
    .check();
  built = await preview(page);
  expect(built.preview.summary.errors).toBe(0);
  await expect(
    page.getByRole("button", { name: /Review build plan/ }),
  ).toBeEnabled();
});
test("missing endpoints stay blocked; unsaved edits cannot reuse an old preview", async ({
  page,
}) => {
  await upload(page, [
    file("catalog.csv", product.replaceAll("PF991001", "PF991010")),
    file(
      "missing-link.csv",
      relation
        .replaceAll("PF991001", "PF991010")
        .replaceAll("ING991001", "ING991999"),
    ),
  ]);
  const built = await preview(page);
  expect(
    built.preview.issues.some((i) => i.code === "LINK_TARGET_NOT_FOUND"),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: /Review build plan/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Mappings$/ }).click();
  await page
    .getByRole("checkbox", { name: "Exclude this file", exact: true })
    .check();
  await expect(
    page.locator(".ab-progress .ant-steps-item").filter({ hasText: "Preview" }),
  ).toHaveClass(/ant-steps-item-disabled/);
  await expect(
    page.getByRole("button", { name: "Confirm mappings & preview" }),
  ).toBeVisible();
});
test("manual workflow remains accessible and assisted controls stay fixed on desktop/mobile", async ({
  page,
}) => {
  await page.goto("/pipeline");
  await expect(
    page.getByText("Select Source", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "rocket Build with assistant", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Build with your data" }),
  ).toBeVisible();
  await upload(page, [
    file(
      "wide.csv",
      "product_id,product_name,protein_100g,fat_100g,fiber_100g,moisture_100g,ash_100g,calcium_100g,phosphorus_100g\nPF991003,Wide test,30,12,3,10,5,1,0.6\n",
    ),
  ]);
  const before = await page.locator(".ab-footer").boundingBox();
  await page.locator(".ab-stage").evaluate((e) => {
    e.scrollTop = e.scrollHeight;
  });
  const after = await page.locator(".ab-footer").boundingBox();
  expect(Math.abs(before.y - after.y)).toBeLessThan(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Confirm mappings & preview" }),
  ).toBeVisible();
});

test("noncanonical per-100g and relationship property aliases can be corrected in the UI", async ({
  page,
}) => {
  await upload(page, [
    file(
      "aliased-products.csv",
      "product_id,product_name,protein_per_100g\nPF991020,Alias test,30\n",
    ),
    file("aliased-ingredients.csv", ingredient),
    file(
      "aliased-links.csv",
      "product_id,ingredient_id,position\nPF991020,ING991001,1\n",
    ),
  ]);
  const property = page.getByRole("combobox", {
    name: "Map PetFoodProduct.protein_per_100g",
    exact: true,
  });
  await property.fill("protein_100g");
  await property.press("Enter");
  await expect(
    page.getByRole("checkbox", { name: "Confirm unit protein_per_100g" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Confirm unit protein_per_100g" })
    .check();
  await page.getByRole("button", { name: /aliased-links.csv/ }).click();
  const order = page.getByRole("combobox", {
    name: "Map CONTAINS.position",
    exact: true,
  });
  await order.click();
  await page.getByText("ingredient_order", { exact: true }).last().click();
  const built = await preview(page);
  expect(built.preview.summary.errors).toBe(0);
  expect(built.preview.links[0].properties.ingredient_order).toBe(1);
});

test("matching existing graph data does not claim that a pending batch was applied", async ({
  page,
  request,
}) => {
  const id = await upload(page, [
    file("existing.csv", "ingredient_id,ingredient_name\nING001,chicken\n"),
  ]);
  const built = await preview(page);
  expect(built.preview.summary.errors).toBe(0);
  await page.getByRole("button", { name: /Review build plan/ }).click();
  await page.getByRole("checkbox", { name: /I reviewed the mappings/ }).check();
  await page
    .getByRole("button", { name: "Submit to Review Queue", exact: true })
    .click();
  await page.getByRole("button", { name: /Verify result/ }).click();
  await page
    .getByRole("button", { name: "reload Check runtime graph", exact: true })
    .click();
  await expect(
    page.getByText("Review batch not applied", { exact: true }),
  ).toBeVisible();
  expect(
    (await (await request.get(`/api/assisted-build/runs/${id}/verify`)).json())
      .applied,
  ).toBe(false);
});

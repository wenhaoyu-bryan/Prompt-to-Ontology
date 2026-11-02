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

test("model settings preserve assignments without exposing saved keys", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/api/llm/connections")).json();
  const key = "fake-ci-model-key-for-contract-only";
  const name = `CI connection ${Date.now()}`;
  const created = await request.post("/api/llm/connections", {
    data: {
      name,
      provider: "openai_compatible",
      model: "ui-contract-model",
      base_url: "http://localhost:8769/v1",
      api_key: key,
    },
  });
  expect(created.ok()).toBeTruthy();
  expect(await created.text()).not.toContain(key);
  const id = (await created.json()).connections.find((c) => c.name === name).id;
  try {
    await page.goto("/models");
    await expect(page.locator(".sidebar-brand")).not.toContainText("Pet Food");
    await page.getByLabel("Assisted build model").click();
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/llm/bindings") && r.request().method() === "PUT",
    );
    await page
      .locator(".ant-select-item-option-content")
      .filter({ hasText: name })
      .click();
    expect((await saved).ok()).toBeTruthy();
    await page.reload();
    const current = await (await request.get("/api/llm/connections")).json();
    expect(current.bindings.build).toBe(id);
    expect(current.bindings.query).toBe(before.bindings.query);
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
    await page
      .getByLabel("Model ID", { exact: true })
      .fill("ui-contract-revised");
    const updated = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/llm/connections/" + id) &&
        r.request().method() === "PUT",
    );
    await page
      .getByRole("button", { name: "Save connection", exact: true })
      .click();
    expect((await updated).ok()).toBeTruthy();
    expect(
      await page.evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      ),
    ).not.toContain(key);
    expect(
      (await (await request.get("/api/llm/connections")).json()).agents.build
        .model,
    ).toBe("ui-contract-revised");
  } finally {
    await request.put("/api/llm/bindings", { data: before.bindings });
    await request.delete("/api/llm/connections/" + id);
  }
});

test("build model configuration closes without losing the current goal", async ({
  page,
}) => {
  await page.goto("/pipeline");
  await page
    .getByLabel("Build goal", { exact: true })
    .fill("Keep this import goal");
  await page
    .getByRole("button", { name: "Model settings", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Agent models", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByLabel("Build goal", { exact: true })).toHaveValue(
    "Keep this import goal",
  );
});

test("model administration token stays in tab memory and is required again after reload", async ({
  page,
}) => {
  const token = "fake-ci-administration-token";
  await page.route("**/api/llm/connections", async (route) => {
    if (route.request().headers().authorization === `Bearer ${token}`)
      return route.continue();
    return route.fulfill({
      status: 401,
      json: { detail: "Model configuration authorization required" },
    });
  });
  await page.goto("/models");
  await page.getByLabel("Administration token", { exact: true }).fill(token);
  await page
    .getByRole("button", { name: "Unlock settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Agent models", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain(token);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Model administration access",
      exact: true,
    }),
  ).toBeVisible();
});

test("unauthorized model status stays unknown and questions remain usable", async ({
  page,
}) => {
  await page.route("**/api/llm/config", (route) =>
    route.fulfill({ status: 401, json: { detail: "Unauthorized" } }),
  );
  let question;
  await page.route("**/api/pet-food/agent/chat", (route) => {
    question = route.request().postDataJSON().question;
    return route.fulfill({ status: 503, json: { detail: "Test response" } });
  });
  await page.goto("/agent");
  await expect(page.getByText("Model status unavailable")).toBeVisible();
  await expect(page.getByText("Deterministic demo")).toHaveCount(0);
  await page.getByLabel("Ask about the ontology").fill("What products exist?");
  await page.getByRole("button", { name: "Ask", exact: false }).click();
  await expect.poll(() => question).toBe("What products exist?");
});

test("connection test shows safe validation and unlocks after authorization expires", async ({
  page,
}) => {
  let status = 400;
  await page.route("**/api/llm/connections/test", (route) =>
    route.fulfill({
      status,
      json: {
        detail:
          status === 400
            ? "api_key is required when provider or base_url changes"
            : "Unauthorized",
      },
    }),
  );
  await page.goto("/models");
  await page
    .getByRole("button", { name: "Add connection", exact: false })
    .click();
  await page.getByLabel("Connection name").fill("Test connection");
  await page.getByLabel("Model ID").fill("test-model");
  await page.getByLabel("API key", { exact: true }).fill("secret-test-key");
  await page
    .getByRole("button", { name: "Test connection", exact: true })
    .click();
  await expect(
    page.getByText("api_key is required when provider or base_url changes"),
  ).toBeVisible();
  status = 401;
  await page
    .getByRole("button", { name: "Test connection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Model administration access" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Add connection" }),
  ).toBeHidden();
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
});

import { test, expect } from "@playwright/test";

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

async function begin(page, files) {
  await page.goto("/pipeline?mode=schema");
  if (files) {
    await page
      .getByLabel("Design goal", { exact: true })
      .fill("Design the uploaded concepts and their reference relationships");
    await page.locator("input[type=file]").setInputFiles(
      files.map(([name, content]) => ({
        name,
        mimeType: "text/csv",
        buffer: Buffer.from(content),
      })),
    );
  } else
    await page.getByRole("button", { name: "Try supplier example" }).click();
  await page.getByRole("combobox", { name: "Schema execution mode" }).click();
  await page
    .getByText("Deterministic baseline · no model call", { exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: /Propose schema/ }).click();
  await expect(
    page.getByRole("button", { name: "View & edit" }).first(),
  ).toBeVisible();
  return new URL(page.url()).searchParams.get("design");
}
async function confirmVisible(page) {
  const count = await page
    .getByRole("button", { name: "View & edit", exact: true })
    .count();
  for (let i = 0; i < count; i++) {
    await page
      .getByRole("button", { name: "View & edit", exact: true })
      .nth(i)
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("button", { name: "Confirm definition", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
}
async function preview(page) {
  const result = page.waitForResponse(
    (r) => r.url().endsWith("/preview") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: /Validate & preview changes/ })
    .click();
  const response = await result;
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("designs unseen types and a relationship, saves a draft, exports and invalidates a revised receipt", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = await begin(page);
  await expect(
    page.getByRole("region", { name: "Proposed schema map" }),
  ).toHaveCount(0);
  await page.getByText("Schema map", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Proposed schema map" }),
  ).toBeVisible();
  await page.getByText("Definition list", { exact: true }).click();
  await confirmVisible(page);
  await page.getByText("Relationships (1)", { exact: true }).click();
  await confirmVisible(page);
  const p = await preview(page);
  expect(p.preview.summary.errors).toBe(0);
  expect(p.preview.summary.pending).toBe(0);
  expect(p.preview.summary.objects).toBe(2);
  expect(p.preview.summary.links).toBe(1);
  await page
    .getByRole("checkbox", { name: /I reviewed the definitions/ })
    .check();
  await page
    .getByRole("button", { name: "Save schema draft", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your schema design is saved" }),
  ).toBeVisible();
  await expect(
    page.getByText("Draft · not active", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toHaveCount(5);
  const data = await (
    await request.get(`/api/assisted-build/schema-designs/${id}/export`)
  ).json();
  expect(data.manifest.status).toBe("draft");
  expect(
    data.files.find((f) => f.name === "source_mappings.json").content,
  ).toContain("supplier_id");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toHaveCount(5);
  await page.getByRole("button", { name: "Continue refining" }).click();
  await page.getByRole("button", { name: "View & edit" }).first().click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Reviewed supplier master records");
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  // Local edits must hide the previously saved export and require confirmation again.
  await preview(page);
  await expect(
    page.getByRole("checkbox", { name: /I reviewed the definitions/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save schema draft", exact: true }),
  ).toBeDisabled();
  expect(
    (
      await request.get(`/api/assisted-build/schema-designs/${id}/export`)
    ).status(),
  ).toBe(409);
  expect(errors).toEqual([]);
});

test("ambiguous identities remain blocked after a user confirms the proposal", async ({
  page,
}) => {
  await begin(page, [
    [
      "Unclear.csv",
      "supplier_id,region_id,name\nS001,R001,Alpha\nS002,R002,Beta\n",
    ],
  ]);
  await confirmVisible(page);
  const p = await preview(page);
  expect(p.preview.issues.some((i) => i.code === "INVALID_KEY")).toBeTruthy();
  await expect(
    page.getByRole("button", { name: "Save schema draft", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Resolve", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Primary key", { exact: true })).toBeVisible();
});

test("existing names require explicit reuse and keep the active definition", async ({
  page,
}) => {
  await begin(page, [["Brand.csv", "brand_id\nNEW001\nNEW002\n"]]);
  await confirmVisible(page);
  let p = await preview(page);
  expect(p.preview.issues.some((i) => i.code === "COLLISION")).toBeTruthy();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.getByRole("button", { name: "View & edit" }).click();
  await page
    .getByRole("button", { name: "Use active definition", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm definition", exact: true })
    .click();
  p = await preview(page);
  expect(p.preview.summary.errors).toBe(0);
  expect(p.preview.definitions[0].change).toBe("reuse");
});

test("keeps design controls fixed while scrolling, supports mobile and preserves the existing import entry", async ({
  page,
}) => {
  await begin(page);
  const before = await page.locator(".ab-progress").boundingBox();
  const footer = await page.locator(".ab-footer").boundingBox();
  await page.locator(".ab-stage").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect((await page.locator(".ab-progress").boundingBox()).y).toBe(before.y);
  expect((await page.locator(".ab-footer").boundingBox()).y).toBe(footer.y);
  await page.setViewportSize({ width: 430, height: 932 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBeTruthy();
  await expect(
    page.getByRole("button", { name: /Validate & preview changes/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Import data", exact: true }).click();
  await expect(page.getByTestId("assisted-build")).toBeVisible();
  await page
    .getByRole("link", { name: "Design schema draft", exact: true })
    .click();
  await expect(page.getByTestId("schema-design")).toBeVisible();
});

test("a delayed preview cannot overwrite another design after browser Back", async ({
  page,
}) => {
  const first = await begin(page);
  const second = await begin(page, [
    ["DistributionHub.csv", "hub_id,hub_name\nH001,North\nH002,South\n"],
  ]);
  const openHistory = async (id) => {
    await page.getByRole("button", { name: /Design history/ }).click();
    await page
      .locator(".sd-history")
      .filter({ hasText: id })
      .getByRole("button", { name: "Open", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`design=${id}`));
    await expect(
      page.getByRole("button", { name: "View & edit" }).first(),
    ).toBeVisible();
  };
  await openHistory(first);
  await openHistory(second);
  let release, entered;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const intercepted = new Promise((resolve) => {
    entered = resolve;
  });
  await page.route(`**/schema-designs/${second}/preview`, async (route) => {
    entered();
    await gate;
    await route.continue();
  });
  const response = page.waitForResponse((r) =>
    r.url().endsWith(`/${second}/preview`),
  );
  await page
    .getByRole("button", { name: /Validate & preview changes/ })
    .click();
  await intercepted;
  try {
    await expect(
      page.getByRole("button", { name: /New design/ }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /Design history/ }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "View & edit" }),
    ).toBeDisabled();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`design=${first}`));
    await expect(page.getByRole("button", { name: "View & edit" })).toHaveCount(
      2,
    );
  } finally {
    release();
  }
  await response;
  await expect(
    page.getByRole("button", { name: /Validate & preview changes/ }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: "View & edit" })).toHaveCount(
    2,
  );
  await expect(
    page.getByRole("button", { name: "Save schema draft", exact: true }),
  ).toHaveCount(0);
});

test("turns pasted PostgreSQL DDL into a reviewed draft with source metadata", async ({ page, request }) => {
  await page.goto("/pipeline?mode=schema");
  await page.getByLabel("Design goal", { exact: true }).fill("Describe suppliers and lots");
  await page.getByRole("button", { name: "Paste DDL" }).click();
  await page.getByRole("textbox", { name: "DDL statements" }).fill(
    "CREATE TABLE vendor (id BIGINT PRIMARY KEY, name TEXT NOT NULL);" +
    "CREATE TABLE lot (lot_no TEXT PRIMARY KEY, vendor_id BIGINT REFERENCES vendor(id));" +
    "COMMENT ON TABLE vendor IS 'A registered supplier';",
  );
  await page.getByRole("button", { name: "Add DDL source" }).click();
  const mode = page.getByRole("combobox", { name: "Schema execution mode" });
  const baseline = "Deterministic baseline · no model call";
  const assistant = "Build Agent · semantic suggestions";
  const design = page.getByRole("region", { name: "Schema design content" });
  const visibleText = (scope, name) =>
    scope.getByText(name, { exact: true }).filter({ visible: true });
  await expect(mode).toBeEnabled();
  await expect(visibleText(design, baseline)).toBeVisible();
  await mode.click();
  await visibleText(page, assistant).click();
  await expect(visibleText(design, assistant)).toBeVisible();
  await mode.click();
  await visibleText(page, baseline).click();
  const create = page.waitForRequest(
    (request) => request.url().endsWith("/schema-designs") && request.method() === "POST",
  );
  await page.getByRole("button", { name: /Propose schema/ }).click();
  expect((await create).postDataJSON()).toMatchObject({
    ddl_dialect: "postgres",
    execution_mode: "deterministic",
  });
  await expect(page.getByRole("button", { name: "View & edit", exact: true })).toHaveCount(2);
  await confirmVisible(page);
  await page.getByText("Relationships (1)", { exact: true }).click();
  await confirmVisible(page);
  const result = await preview(page);
  expect(result.preview.summary).toMatchObject({ objects: 2, links: 1, errors: 0, pending: 0 });
  await page.getByRole("checkbox", { name: /I reviewed the definitions/ }).check();
  await page.getByRole("button", { name: "Save schema draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your schema design is saved" })).toBeVisible();
  const id = new URL(page.url()).searchParams.get("design");
  const response = await request.get(`/api/assisted-build/schema-designs/${id}/export`);
  expect(response.ok()).toBeTruthy();
  const exported = await response.json();
  const mappings = JSON.parse(exported.files.find((file) => file.name === "source_mappings.json").content);
  expect(exported.manifest.status).toBe("draft");
  expect(mappings.ddl_sources[0].table.comment).toBe("A registered supplier");
  expect(mappings.ddl_sources[1].table.foreign_keys[0].target_table).toBe("vendor");
});

test("uses the chosen MySQL dialect for uploaded DDL and restores it from history", async ({ page }) => {
  await page.goto("/pipeline?mode=schema");
  await page.getByLabel("Design goal", { exact: true }).fill("Describe suppliers from MySQL");
  await page.locator("input[type=file]").setInputFiles({
    name: "supplier.sql",
    mimeType: "text/plain",
    buffer: Buffer.from("CREATE TABLE `supplier` (`id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB;"),
  });
  const dialect = page.getByRole("combobox", { name: "DDL dialect" });
  const design = page.getByRole("region", { name: "Schema design content" });
  await expect(dialect).toBeEnabled();
  await expect(design.getByText("PostgreSQL", { exact: true }).filter({ visible: true })).toBeVisible();
  await dialect.click();
  await page.getByText("MySQL", { exact: true }).filter({ visible: true }).click();
  const create = page.waitForRequest(
    (request) => request.url().endsWith("/schema-designs") && request.method() === "POST",
  );
  await page.getByRole("button", { name: /Propose schema/ }).click();
  expect((await create).postDataJSON()).toMatchObject({
    ddl_dialect: "mysql",
    execution_mode: "deterministic",
  });
  await expect(page.getByRole("button", { name: "View & edit", exact: true })).toHaveCount(1);
  const id = new URL(page.url()).searchParams.get("design");
  await page.getByRole("button", { name: /New design/ }).click();
  await page.getByRole("button", { name: /Design history/ }).click();
  await page.locator(".sd-history").filter({ hasText: id }).getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("button", { name: "View & edit", exact: true })).toHaveCount(1);
  await page.getByText("Sources & goal", { exact: true }).click();
  await expect(dialect).toBeDisabled();
  await expect(design.getByText("MySQL", { exact: true }).filter({ visible: true })).toBeVisible();
});

test("attaches a Markdown SOP to DDL and opens the source at a suggested rule", async ({ page }) => {
  const original = "# Dispatch SOP\n\nDo not ship lots on quality hold.\nCall the quality team for release.";
  const id = "sd-0123456789abcdef01234567";
  const run = {
    id,
    goal: "Track lot release",
    revision: 1,
    source_kind: "ddl",
    ddl_dialect: "postgres",
    execution_mode: "auto",
    status: "needs_confirmation",
    sources: [],
    objects: [],
    links: [],
    reference_documents: [{ id: "doc-1", name: "dispatch.md", line_count: 4 }],
    document_suggestions: [{
      id: "suggestion-1",
      kind: "rule",
      title: "Block dispatch while on hold",
      description: "A quality hold prevents dispatch.",
      citation: {
        document_id: "doc-1",
        name: "dispatch.md",
        heading: "Dispatch SOP",
        start_line: 3,
        end_line: 3,
        quote: "Do not ship lots on quality hold.",
      },
    }],
  };
  await page.route("**/api/assisted-build/schema", (route) => route.fulfill({ json: { schema: {} } }));
  await page.route("**/api/assisted-build/schema-designs", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      execution_mode: "auto",
      reference_documents: [{ name: "dispatch.md", content: original }],
    });
    await route.fulfill({ status: 202, json: run });
  });
  await page.route(`**/api/assisted-build/schema-designs/${id}`, (route) => route.fulfill({ json: run }));
  await page.route(`**/api/assisted-build/schema-designs/${id}/documents/doc-1`, (route) =>
    route.fulfill({ json: { ...run.reference_documents[0], content: original } }),
  );

  await page.goto("/pipeline?mode=schema");
  await page.getByLabel("Design goal", { exact: true }).fill(run.goal);
  await page.getByRole("button", { name: "Paste DDL" }).click();
  await page.getByRole("textbox", { name: "DDL statements" }).fill("CREATE TABLE lot (id BIGINT PRIMARY KEY);");
  await page.getByRole("button", { name: "Add DDL source" }).click();
  await page.getByLabel("Upload Markdown reference documents").setInputFiles({
    name: "dispatch.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(original),
  });
  const propose = page.getByRole("button", { name: "Propose schema" });
  await expect(propose).toBeDisabled();
  await page.getByRole("combobox", { name: "Schema execution mode" }).click();
  await page.getByText("Build Agent · semantic suggestions", { exact: true }).filter({ visible: true }).click();
  await propose.click();
  await expect(page.getByText("Block dispatch while on hold")).toBeVisible();
  await page.getByRole("button", { name: /dispatch\.md.*line 3/i }).click();
  const source = page.getByRole("dialog", { name: "dispatch.md" });
  await expect(source).toBeVisible();
  await expect(source.getByText("Do not ship lots on quality hold.", { exact: true })).toBeVisible();
  await expect(source.getByText("Call the quality team for release.", { exact: true })).toBeVisible();
  await expect(source.getByText("Cited line 3", { exact: true })).toBeVisible();
});

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
  ).toBeVisible();
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
  await page.getByRole("button", { name: "Map to existing schema" }).click();
  await expect(page.getByTestId("assisted-build")).toBeVisible();
  await page
    .getByRole("button", { name: "Design new schema", exact: true })
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

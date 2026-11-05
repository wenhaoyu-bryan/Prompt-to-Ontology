import { test, expect } from "@playwright/test";

const property = (name) => ({
  name,
  type: "string",
  required: true,
  description: "",
  enum_values: [],
  default: null,
  unit: "",
  source_field: "",
  source_bindings: [],
});
const supplier = {
  name: "Supplier",
  label: "Supplier",
  description: "Ingredient supplier",
  primary_key: "supplier_id",
  display_name: "supplier_id",
  required_properties: ["supplier_id"],
  properties: [property("supplier_id")],
  source_bindings: [],
  metadata: {},
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "pto-auth",
      JSON.stringify({ username: "demo", name: "Demo User" }),
    );
    localStorage.setItem("i18nextLng", "en");
  });
});

test("creates and reopens a typed object using the shared design drawer", async ({
  page,
}) => {
  let catalog = {
    domain: "pet_food",
    revision: 1,
    object_types: {},
    link_types: {},
  };
  await page.route("**/api/ontology/pet_food/schema", (route) =>
    route.fulfill({
      json: {
        objectTypes: {},
        linkTypes: {},
        rules: {},
        metrics: {},
        actionTypes: {},
      },
    }),
  );
  await page.route("**/api/ontology/pet_food/design", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.route(
    "**/api/ontology/pet_food/design/definitions",
    async (route) => {
      const body = route.request().postDataJSON();
      expect(body.expected_revision).toBe(1);
      expect(body.create_only).toBe(true);
      expect(body.object_types[0]).toMatchObject({
        name: "Supplier",
        label: "Supplier",
        primary_key: "id",
        properties: [{ name: "id", type: "string", required: true }],
      });
      catalog = {
        ...catalog,
        revision: 2,
        object_types: { Supplier: body.object_types[0] },
      };
      await route.fulfill({ json: catalog });
    },
  );
  await page.goto("/schema");
  await page.getByRole("button", { name: "New object", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "New object" });
  await drawer
    .getByRole("textbox", { name: "Technical name", exact: true })
    .fill("Supplier");
  await drawer
    .getByRole("textbox", { name: "Display label", exact: true })
    .fill("Supplier");
  await drawer
    .getByRole("button", { name: "Save definition", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Supplier", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await page.reload();
  await page
    .getByRole("row")
    .filter({ hasText: "Supplier" })
    .getByRole("button", { name: "View details", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Supplier", exact: true }),
  ).toContainText("Primary key");
});

test("opens field provenance and reports a stale design save", async ({
  page,
}) => {
  const original = {
    ...supplier,
    properties: [
      {
        ...property("supplier_id"),
        source_bindings: [
          {
            kind: "ddl",
            source_name: "supply.sql",
            source_field: "supplier_id",
            table: "supplier",
            content_hash: "test-hash",
            status: "imported",
          },
        ],
      },
    ],
  };
  await page.route("**/api/ontology/pet_food/schema", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.route("**/api/ontology/pet_food/design", (route) =>
    route.fulfill({
      json: {
        domain: "pet_food",
        revision: 2,
        object_types: { Supplier: original },
        link_types: {},
      },
    }),
  );
  await page.route("**/api/ontology/pet_food/design/definitions", (route) =>
    route.fulfill({
      status: 409,
      json: { detail: "Design changed; reload before saving" },
    }),
  );
  await page.goto("/schema?tab=objectTypes&asset=Supplier");
  const drawer = page.getByRole("dialog", { name: "Supplier", exact: true });
  await drawer
    .getByRole("button", { name: "View source for supplier_id" })
    .click();
  await expect(drawer).toContainText("supply.sql");
  await expect(drawer).toContainText("supplier.supplier_id");
  await drawer.getByRole("tab", { name: "Definition", exact: true }).click();
  await drawer
    .getByRole("button", { name: "Edit definition", exact: true })
    .click();
  await drawer
    .getByRole("textbox", { name: "Display label", exact: true })
    .fill("Approved supplier");
  await drawer
    .getByRole("button", { name: "Save definition", exact: true })
    .click();
  await expect(drawer.getByRole("alert")).toContainText(
    "Reload the design before saving",
  );
});

test("creates a relationship with cardinality and typed relationship properties", async ({
  page,
}) => {
  const lot = { ...supplier, name: "Lot", label: "Lot" };
  let catalog = {
    domain: "pet_food",
    revision: 1,
    object_types: { Supplier: supplier, Lot: lot },
    link_types: {},
  };
  await page.route("**/api/ontology/pet_food/schema", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.route("**/api/ontology/pet_food/design", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.route(
    "**/api/ontology/pet_food/design/definitions",
    async (route) => {
      const body = route.request().postDataJSON();
      expect(body.link_types[0]).toMatchObject({
        name: "SUPPLIED_BY",
        source_type: "Lot",
        target_type: "Supplier",
        cardinality: "MANY_TO_ONE",
        properties: [{ name: "share", type: "number", unit: "%" }],
      });
      catalog = {
        ...catalog,
        revision: 2,
        link_types: { SUPPLIED_BY: body.link_types[0] },
      };
      await route.fulfill({ json: catalog });
    },
  );
  await page.goto("/schema?tab=linkTypes");
  await page
    .getByRole("button", { name: "New relationship", exact: true })
    .click();
  const drawer = page.getByRole("dialog", {
    name: "New relationship",
    exact: true,
  });
  await drawer
    .getByRole("textbox", { name: "Technical name", exact: true })
    .fill("SUPPLIED_BY");
  const choose = async (name, value) => {
    await drawer.getByRole("combobox", { name, exact: true }).click();
    await page
      .locator(".ant-select-dropdown")
      .filter({ visible: true })
      .getByText(value, { exact: true })
      .click();
  };
  await choose("Source object", "Lot");
  await choose("Target object", "Supplier");
  await choose("Cardinality", "MANY TO ONE");
  await drawer.getByRole("button", { name: "Add property" }).click();
  await drawer.getByRole("textbox", { name: "Property 1 name" }).fill("share");
  await choose("Property 1 type", "number");
  await drawer.getByRole("textbox", { name: "Unit", exact: true }).fill("%");
  await drawer.getByRole("button", { name: "Save definition" }).click();
  await expect(
    page.getByRole("dialog", { name: "SUPPLIED_BY", exact: true }),
  ).toContainText("MANY_TO_ONE");
});

test("keeps the definition drawer open until a delayed save completes", async ({
  page,
}) => {
  let finishSave;
  let saveStarted;
  const saved = new Promise((resolve) => {
    finishSave = resolve;
  });
  const started = new Promise((resolve) => {
    saveStarted = resolve;
  });
  const lot = { ...supplier, name: "Lot", label: "Lot" };
  const catalog = {
    domain: "pet_food",
    revision: 1,
    object_types: { Supplier: supplier, Lot: lot },
    link_types: {},
  };
  await page.route("**/api/ontology/pet_food/schema", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.route("**/api/ontology/pet_food/design", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.route(
    "**/api/ontology/pet_food/design/definitions",
    async (route) => {
      const body = route.request().postDataJSON();
      saveStarted();
      await saved;
      await route.fulfill({
        json: {
          ...catalog,
          revision: 2,
          object_types: {
            ...catalog.object_types,
            Supplier: body.object_types[0],
          },
        },
      });
    },
  );
  await page.goto("/schema?tab=objectTypes&asset=Supplier");
  const drawer = page.getByRole("dialog", { name: "Supplier", exact: true });
  await drawer
    .getByRole("button", { name: "Edit definition", exact: true })
    .click();
  await drawer
    .getByRole("textbox", { name: "Display label", exact: true })
    .fill("Approved supplier");
  await drawer
    .getByRole("button", { name: "Save definition", exact: true })
    .click();
  await started;
  try {
    await expect(
      drawer.getByRole("button", { name: "Close", exact: true }),
    ).toBeDisabled();
    await expect(
      drawer.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeVisible();
    await page.locator(".ant-drawer-mask").click({ position: { x: 8, y: 8 } });
    await expect(drawer).toBeVisible();
    await expect(
      drawer.getByRole("textbox", { name: "Display label", exact: true }),
    ).toHaveValue("Approved supplier");
  } finally {
    finishSave();
  }
  const completed = page.getByRole("dialog", {
    name: "Approved supplier",
    exact: true,
  });
  await expect(completed).toBeVisible();
  await completed
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "Lot" })
    .getByRole("button", { name: "View details", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Lot", exact: true }),
  ).toBeVisible();
});

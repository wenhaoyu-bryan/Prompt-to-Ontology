import { test, expect } from "@playwright/test";

test("a fresh visit uses light mode before and after the app loads", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("button", { name: "Switch to dark mode" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("an explicit dark preference persists across navigation and reload", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "pto-auth",
      JSON.stringify({ username: "demo", name: "Demo User" }),
    );
    localStorage.setItem("pto-theme-mode", "dark");
  });
  await page.goto("/dashboard");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();
  await page
    .getByRole("menuitem", { name: "node-index Graph Explorer", exact: true })
    .click();
  await expect(page.getByTestId("sigma-graph")).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("the document has a light initial background without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/login`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await context.close();
});

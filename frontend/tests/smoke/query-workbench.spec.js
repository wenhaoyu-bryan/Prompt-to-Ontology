import { test, expect } from "@playwright/test";

const inputName = "Ask about the ontology";
const ask = async (page, question) => {
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/pet-food/agent/chat") &&
      response.request().method() === "POST",
  );
  await page.getByRole("textbox", { name: inputName }).fill(question);
  await page.getByRole("button", { name: "send Ask", exact: true }).click();
  expect((await response).ok()).toBeTruthy();
  await expect(page.getByTestId("query-answer")).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "pto-auth",
      JSON.stringify({ username: "demo", name: "Demo User" }),
    ),
  );
});

test("a real answer links to its runtime relationship and returns to the same turn", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/agent");
  await page
    .getByRole("button", {
      name: "tool Which products contain chicken? arrow-right",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("query-answer")).toContainText(
    "find_products_by_ingredient",
  );
  await expect(page.getByTestId("query-answer")).toContainText("WhiskerPro");
  const conversationUrl = page.url();
  await page.getByRole("button", { name: "Helpful", exact: true }).click();
  await expect(page.getByTestId("query-answer")).toContainText(
    "Feedback recorded",
  );
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pto-query-conversations-v1")),
  );
  const turn = stored[0].turns[0];
  const feedback = await (
    await request.get(`/api/agent/feedback/${turn.result.trace_id}`)
  ).json();
  expect(feedback.feedback.turn_id).toBe(turn.id);
  expect(feedback.feedback.agent_run_id).toBe(turn.result.agent_run_id);
  await page.getByRole("tab", { name: /Relationships/ }).click();
  await expect(page.getByLabel("Runtime relationship path")).toBeVisible();
  await page.getByRole("button", { name: "Explore in graph" }).click();
  await expect(page.getByTestId("sigma-graph")).toBeVisible();
  await expect(page.getByTestId("graph-evidence-panel")).toContainText(
    "Query relationship matched",
  );
  await page.getByRole("button", { name: "Back to answer" }).click();
  await expect(page).toHaveURL(conversationUrl);
  await expect(page.getByTestId("query-answer")).toContainText(
    "Feedback recorded",
  );
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(page.getByTestId("query-evidence")).toContainText(
    "Original file-row or document citations were not supplied",
  );
  expect(errors.filter((error) => !error.includes("ResizeObserver"))).toEqual(
    [],
  );
});

test("follow-up context, earlier answers, rename and archive survive reload", async ({
  page,
}) => {
  await page.goto("/agent");
  await page.getByRole("button", { name: /tool Explain PF001/ }).click();
  await expect(page.getByTestId("query-answer")).toContainText("WhiskerPro");
  const followUp = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/pet-food/agent/chat") &&
      request.method() === "POST",
  );
  await ask(page, "What about its ingredients?");
  const context = (await followUp).postDataJSON().context;
  expect(context.current_product_id).toBe("PF001");
  expect(context.history).toHaveLength(2);
  await expect(page.getByTestId("query-turn")).toHaveCount(2);
  await expect(page.getByTestId("query-answer")).toContainText("PF001");
  await page.locator(".query-prior").click();
  await expect(page.getByTestId("query-answer")).toContainText("WhiskerPro");
  const selectedUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(selectedUrl);
  await expect(page.getByTestId("query-turn")).toHaveCount(2);
  if (
    !(await page
      .getByRole("textbox", { name: "Search conversations" })
      .isVisible())
  )
    await page.getByRole("button", { name: "Toggle history" }).click();
  await page.getByRole("button", { name: /Conversation actions/ }).click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Conversation title" })
    .fill("Product evidence review");
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.locator(".query-conversation-name")).toContainText(
    "Product evidence review",
  );
  await page.getByRole("button", { name: /Conversation actions/ }).click();
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
  await expect(page.locator(".query-history-list")).not.toContainText(
    "Product evidence review",
  );
  await page.getByText("Archived", { exact: true }).click();
  await expect(page.locator(".query-history-list")).toContainText(
    "Product evidence review",
  );
  await page.getByRole("button", { name: /Conversation actions/ }).click();
  await page.getByRole("menuitem", { name: "Restore", exact: true }).click();
  await page.getByText("Recent", { exact: true }).click();
  await expect(page.locator(".query-history-list")).toContainText(
    "Product evidence review",
  );
});

test("query failure can be retried without duplicating the turn", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/pet-food/agent/chat", async (route) => {
    attempts += 1;
    if (attempts === 1)
      await route.fulfill({
        status: 503,
        json: { detail: "Temporary query failure" },
      });
    else await route.continue();
  });
  await page.goto("/agent");
  await page.getByRole("textbox", { name: inputName }).fill("Explain PF001");
  await page.getByRole("button", { name: "send Ask", exact: true }).click();
  await expect(page.getByText("Temporary query failure")).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByTestId("query-answer")).toContainText("WhiskerPro");
  await expect(page.getByTestId("query-turn")).toHaveCount(1);
});

test("header and composer remain visible while only conversation content scrolls", async ({
  page,
}) => {
  await page.goto("/agent");
  await ask(page, "Explain PF001");
  await expect(page.locator(".query-attributes").first()).toBeVisible();
  const fixed = await page.locator(".query-composer").boundingBox();
  await page.locator(".query-conversation-scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const after = await page.locator(".query-composer").boundingBox();
  expect(after.y).toBe(fixed.y);
  await expect(page.getByRole("textbox", { name: inputName })).toBeInViewport();
  await expect(page.locator(".query-conversation-header")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.scrollingElement.scrollHeight <= window.innerHeight + 2,
    ),
  ).toBeTruthy();
});

test("mobile workspace keeps its input and history control accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/agent");
  await expect(page.getByRole("textbox", { name: inputName })).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Toggle history" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.scrollingElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Toggle history" }).click();
  await expect(
    page.getByRole("textbox", { name: "Search conversations" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Toggle history" }).click();
  await ask(page, "Compare PF001 and PF002");
  await expect(page.getByTestId("query-answer")).toContainText("PF001");
  await expect(page.getByRole("textbox", { name: inputName })).toBeInViewport();
});

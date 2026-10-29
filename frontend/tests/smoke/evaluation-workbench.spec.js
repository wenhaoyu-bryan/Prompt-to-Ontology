import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "pto-auth",
      JSON.stringify({ username: "demo", name: "Demo User" }),
    ),
  );
});

test("query history is collapsed by default on desktop", async ({ page }) => {
  await page.goto("/agent");
  await expect(page.locator(".query-shell")).toHaveClass(/is-collapsed/);
  await expect(
    page.getByRole("textbox", { name: "Search conversations" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Toggle history" }).click();
  await expect(
    page.getByRole("textbox", { name: "Search conversations" }),
  ).toBeVisible();
});

test("real baseline evaluation records answers, evidence and comparable runs", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/verified-qa");
  await expect(
    page.getByRole("heading", { name: "Evaluation & feedback" }),
  ).toBeVisible();
  await expect(page.getByTestId("evaluation-case-AQ01")).toBeVisible();
  const batchResponse = page.waitForResponse(response => response.url().endsWith('/api/agent/question-evaluations/runs') && response.request().method() === 'POST');
  await page.getByRole("button", { name: /Run question set/ }).click();
  const batch = await (await batchResponse).json();
  await expect(page).toHaveURL(new RegExp(`run=${batch.id}`));
  await expect(page.locator(".eval-run-bar")).toContainText("Completed", {
    timeout: 30000,
  });
  await expect(page.getByTestId("evaluation-case-AQ01")).toContainText("67%");
  const singleResponse = page.waitForResponse(response => response.url().endsWith('/api/agent/question-evaluations/runs') && response.request().method() === 'POST');
  await page
    .getByRole("button", { name: "Run this question", exact: true })
    .click();
  const single = await (await singleResponse).json();
  await expect(page).toHaveURL(new RegExp(`run=${single.id}`));
  await expect(page.locator(".eval-run-bar")).toContainText("Completed", {
    timeout: 30000,
  });
  await page.getByRole("tab", { name: "Before / after", exact: true }).click();
  await page.getByRole("combobox", { name: "Compare with run" }).click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .first()
    .click();
  await expect(page.getByTestId("evaluation-comparison")).toContainText(
    "Evidence changes",
  );
  await expect(page.getByTestId("evaluation-comparison")).toContainText(
    "active schema is unchanged",
  );
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await page.getByRole("tab", { name: /Relationships/ }).click();
  await page.getByRole("button", { name: "Explore in graph" }).click();
  await expect(page.getByTestId("graph-evidence-panel")).toContainText(
    "Query relationship matched",
  );
  await page.getByRole("button", { name: /Back to evaluation/ }).click();
  await expect(
    page.getByRole("heading", { name: "Evaluation & feedback" }),
  ).toBeVisible();
  await expect(page.locator(".eval-details")).toContainText("AQ01");
  expect(errors.filter((err) => !err.includes("ResizeObserver"))).toEqual([]);
});

test("feedback becomes a persistent editable case without manufacturing a score", async ({
  page,
  request,
}) => {
  const chat = await (
    await request.post("/api/pet-food/agent/chat", {
      data: {
        question: "Explain PF001",
        context: { execution_mode: "deterministic" },
      },
    })
  ).json();
  const row = await (
    await request.post("/api/agent/feedback", {
      data: {
        trace_id: chat.trace_id,
        agent_run_id: chat.agent_run_id,
        conversation_id: "test-evaluation",
        turn_id: crypto.randomUUID(),
        rating: "negative",
        category: "Incomplete evidence",
        comment: "Review original row citations",
      },
    })
  ).json();
  await page.goto(`/verified-qa?panel=feedback&feedback=${row.id}`);
  await expect(page.locator(".eval-details")).toContainText(
    "Review original row citations",
  );
  await page
    .getByRole("button", { name: "Create evaluation case", exact: true })
    .click();
  const drawer = page.getByRole("dialog", {
    name: "Create case from feedback",
  });
  await expect(drawer).toBeVisible();
  await drawer
    .getByRole("textbox", { name: "Expected result and boundaries" })
    .fill("Human reviewer must confirm source-row references.");
  await drawer
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await expect(drawer).not.toBeVisible();
  await expect(page.locator(".eval-details")).toContainText(
    "Human reviewer must confirm",
  );
  await page
    .getByRole("button", { name: "Run this question", exact: true })
    .click();
  await expect(page.locator(".eval-run-bar")).toContainText("Completed", {
    timeout: 30000,
  });
  await expect(page.locator(".eval-result-summary")).toContainText(
    "Needs review",
  );
  await expect(page.locator(".eval-result-summary")).toContainText("—");
  await page.reload();
  await expect(page.locator(".eval-details")).toContainText(
    "Human reviewer must confirm",
  );
  const stored = await (await request.get("/api/agent/feedback")).json();
  expect(stored.feedback.find((item) => item.id === row.id).review_status).toBe(
    "processed",
  );
});

test("evaluation replay prefills a new question and retains the return link", async ({
  page,
}) => {
  await page.goto("/verified-qa");
  await expect(page.getByTestId("evaluation-case-AQ01")).toBeVisible();
  await page.getByTestId("evaluation-case-AQ01").click();
  const question = await page.locator(".eval-details h2").innerText();
  await page
    .getByRole("button", { name: "Reproduce in query", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Ask about the ontology" }),
  ).toHaveValue(question);
  await expect(page.getByTestId("query-turn")).toHaveCount(0);
  const evaluationRun = new URL(page.url()).searchParams.get('evaluation_run');
  await page.getByRole('button',{name:'send Ask',exact:true}).click();
  await expect(page.getByTestId('query-answer')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('case')).toBe('AQ01');
  expect(new URL(page.url()).searchParams.get('evaluation_run')).toBe(evaluationRun);
  await page.getByRole("button", { name: "Evaluation", exact: true }).click();
  await expect(page.locator(".eval-details")).toContainText("AQ01");
  expect(new URL(page.url()).searchParams.get('run')).toBe(evaluationRun);
});

test('missing-data results keep machine scores separate from manual review', async ({page,request}) => {
  const created = await (await request.post('/api/agent/question-evaluations/runs',{data:{case_ids:['AQ04'],execution_mode:'deterministic'}})).json();
  await page.goto(`/verified-qa?run=${created.id}&case=AQ04`);
  await expect(page.locator('.eval-result-summary')).toContainText('Needs review',{timeout:15000});
  await expect(page.locator('.eval-result-summary')).toContainText('100%');
  await page.getByRole('textbox',{name:'Review note',exact:true}).fill('Boundary checked by an automated UI test.');
  await page.getByRole('button',{name:'Accept after review',exact:true}).click();
  await expect(page.locator('.eval-result-summary')).toContainText('Manually reviewed');
  await expect(page.locator('.eval-result-summary')).toContainText('100%');
  await page.reload();
  await expect(page.locator('.eval-result-summary')).toContainText('Manually reviewed');
});

test('editing a case retains the original question on historical results', async ({page,request}) => {
  const original = {question:'Explain PF001',expected:'Return the original product',required_ids:['PF001']};
  const question = await (await request.post('/api/agent/question-evaluations/cases',{data:original})).json();
  const run = await (await request.post('/api/agent/question-evaluations/runs',{data:{case_ids:[question.id],execution_mode:'deterministic'}})).json();
  await expect.poll(async()=> (await (await request.get(`/api/agent/question-evaluations/runs/${run.id}`)).json()).status).toBe('completed');
  await request.put(`/api/agent/question-evaluations/cases/${question.id}`,{data:{...original,question:'Explain PF002',expected:'Return the updated product',required_ids:['PF002']}});
  const catalog = await (await request.get('/api/agent/question-evaluations/cases')).json();
  expect(catalog.latest_results[question.id]).toBeUndefined();
  await page.goto(`/verified-qa?run=${run.id}&case=${question.id}`);
  await expect(page.locator('.eval-details h2')).toHaveText('Explain PF001');
  await expect(page.locator('.eval-expectation')).toContainText('earlier case revision');
  await page.getByRole('button',{name:'Reproduce in query',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Ask about the ontology'})).toHaveValue('Explain PF001');
});

test("mobile evaluation remains usable and preserves reference questions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/verified-qa");
  await expect(
    page.getByRole("heading", { name: "Evaluation & feedback" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.scrollingElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Reference tests · 22", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Verified Questions/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to evaluation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Evaluation & feedback" }),
  ).toBeVisible();
});

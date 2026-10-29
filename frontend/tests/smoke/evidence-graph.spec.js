import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pto-auth', JSON.stringify({ username: 'demo', name: 'Demo User' })));
});

test('sample answer links to a verified runtime relationship and its source', async ({ page, request }) => {
  const first = await (await request.get('/api/graph')).json();
  const second = await (await request.get('/api/graph')).json();
  const link = first.links.find(edge => edge.source === 'PF001' && edge.target === 'ING001' && edge.linkType === 'CONTAINS');
  expect(link?.id).toBeTruthy();
  expect(second.links.find(edge => edge.id === link.id)).toBeTruthy();

  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/verified-qa?view=reference');
  await page.getByRole('row').filter({ hasText: 'Q03' }).getByRole('button', { name: 'Run read-only' }).click();
  await expect(page.getByTestId('evidence-path')).toBeVisible();
  await page.getByRole('button', { name: 'Explore in graph' }).click();
  await expect(page).toHaveURL(/\/graph\?question=Q03/);
  await expect(page.getByTestId('sigma-graph')).toBeVisible();
  await expect(page.getByTestId('sigma-graph').locator('canvas').first()).toBeVisible();
  await expect(page.getByTestId('graph-evidence-panel')).toContainText('Relationship found in runtime graph');
  await expect(page.getByTestId('graph-evidence-panel')).toContainText('Answer from sample files');
  await expect(page.getByTestId('graph-evidence-panel')).toContainText('WhiskerPro Adult Chicken Formula');
  await page.getByRole('button', { name: 'View all properties' }).click();
  await expect(page.getByRole('dialog', { name: 'Object details' })).toContainText('PF001');
  await page.getByRole('dialog', { name: 'Object details' }).getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('graph-evidence-panel').getByRole('button', { name: /product_ingredients.csv/ }).click();
  await expect(page.getByRole('dialog', { name: 'Source record' })).toContainText('PF001:ING001');
  await page.getByRole('dialog', { name: 'Source record' }).getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Relationships' }).click();
  await page.getByLabel('CONTAINS').uncheck();
  await expect(page.getByTestId('graph-evidence-panel')).toContainText('hidden by the current filter');
  expect(errors.filter(error => !error.includes('ResizeObserver'))).toEqual([]);
});

test('missing time evidence does not display a path or assert a runtime relation', async ({ page }) => {
  await page.goto('/verified-qa?view=reference');
  await page.getByRole('row').filter({ hasText: 'Q07' }).getByRole('button', { name: 'Run read-only' }).click();
  await expect(page.getByTestId('verified-answer')).toContainText('trusted_time_missing');
  await expect(page.getByTestId('evidence-path')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Explore in graph' })).toHaveCount(0);
});

test('a sample relation missing from the runtime graph is reported as missing', async ({ page, request }) => {
  const response = await request.get('/api/graph');
  const data = await response.json();
  data.links = data.links.filter(edge => !(edge.source === 'PF001' && edge.target === 'ING001' && edge.linkType === 'CONTAINS'));
  await page.route('**/api/graph', async route => {
    await route.fulfill({ json: data });
  });
  await page.goto('/graph?question=Q03');
  await expect(page.getByTestId('graph-evidence-panel')).toContainText('The full path is not present in the runtime graph');
  await expect(page.getByTestId('graph-evidence-panel')).not.toContainText('Relationship found in runtime graph');
  await page.unrouteAll({ behavior: 'wait' });
});

test('overview explains the reduced relationships and can show them all', async ({ page, request }) => {
  const graph = await (await request.get('/api/graph')).json();
  await page.goto('/graph');
  await expect(page.getByText(/Simplified overview/)).toBeVisible();
  await page.getByRole('button', { name: 'Show all links' }).click();
  await expect(page.getByRole('button', { name: 'Simplify links' })).toBeVisible();
  await expect(page.locator('.graph-heading')).toContainText(`${graph.links.length} relationships`);
  await page.getByRole('button', { name: 'Simplify links' }).click();
  await expect(page.getByText(/Simplified overview/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Find an object' }).fill('PF001');
  await page.locator('.ant-select-item-option').filter({ hasText: 'PF001' }).first().click();
  await expect(page.getByTestId('graph-evidence-panel')).toContainText('WhiskerPro Adult Chicken Formula');
  await expect(page.locator('.graph-heading')).toContainText('Focus:');
});

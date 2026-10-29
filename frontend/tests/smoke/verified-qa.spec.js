// @ts-check
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pto-auth', JSON.stringify({ username: 'demo', name: 'Demo User' }));
  });
});

test('verified answers expose evidence and abstain when a source field is absent', async ({ page }) => {
  await page.goto('/verified-qa?view=reference');
  await expect(page.getByText('Question catalog')).toBeVisible();

  await page.getByRole('row').filter({ hasText: 'Q03' }).getByRole('button', { name: 'Run read-only' }).click();
  await expect(page.getByTestId('verified-answer')).toContainText('ING001 is first');
  await page.getByRole('button', { name: 'View source' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Source record' })).toContainText('product_ingredients.csv');
  await page.getByRole('dialog', { name: 'Source record' }).getByRole('button', { name: 'Close' }).click();

  await page.getByRole('row').filter({ hasText: 'Q06' }).getByRole('button', { name: 'Run read-only' }).click();
  await expect(page.getByTestId('verified-answer')).toContainText('source_field_missing');
  await expect(page.getByTestId('verified-answer')).toContainText('Cannot confirm');
});

test('regression UI runs all questions, reruns affected cases, and compares runs', async ({ page }) => {
  await page.goto('/verified-qa?view=reference');
  await page.getByRole('button', { name: 'Run all 22 questions' }).click();
  await expect(page.getByText('conclusion: 22/22')).toBeVisible();
  await expect(page.getByText('evidence: 22/22')).toBeVisible();
  await expect(page.getByText('path: 22/22')).toBeVisible();
  await expect(page.getByText('abstention: 22/22')).toBeVisible();

  await page.getByRole('button', { name: 'Rerun affected questions' }).click();
  await expect(page.getByText('conclusion: 1/1')).toBeVisible();
  await page.getByRole('button', { name: 'Compare latest two runs' }).click();
  await expect(page.getByText('Per-question before / after')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Q01' }).last()).toContainText('no');
});

test('metric and action contracts answer concrete questions in the UI', async ({ page }) => {
  await page.goto('/schema');
  await page.getByRole('tab', { name: 'Metric definitions (1)' }).click();
  await page.getByRole('row').filter({ hasText: 'ProductCountBySpecies' }).getByRole('button', { name: 'View details' }).click();
  const metricDrawer = page.getByRole('dialog', { name: /ProductCountBySpecies/ });
  await expect(metricDrawer).toContainText('target_species');
  await metricDrawer.getByRole('button', { name: 'Edit draft' }).click();
  await metricDrawer.getByRole('textbox', { name: /Unit/ }).fill('sample items');
  await metricDrawer.getByRole('button', { name: 'Save draft' }).click();
  await expect(metricDrawer).toContainText('sample items');
  await metricDrawer.getByRole('button', { name: 'Discard draft' }).click();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(metricDrawer).toContainText('products');
  await metricDrawer.getByRole('button', { name: 'Close' }).last().click();
  await page.getByRole('tab', { name: /Actions \(4\)/ }).click();
  await page.getByRole('row').filter({ hasText: 'ExplainProductRisk' }).getByRole('button', { name: 'View details' }).click();
  await expect(page.getByRole('dialog', { name: 'ExplainProductRisk' })).toContainText('product_id');

  await page.goto('/verified-qa?view=reference');
  await page.getByRole('listitem', { name: '3' }).click();
  await page.getByRole('row').filter({ hasText: 'Q21' }).getByRole('button', { name: 'Run read-only' }).click();
  await expect(page.getByTestId('verified-answer')).toContainText('7 products');
  await page.getByRole('row').filter({ hasText: 'Q22' }).getByRole('button', { name: 'Run read-only' }).click();
  await expect(page.getByTestId('verified-answer')).toContainText('requires product_id');
});

test('JSON upload reaches the existing source and mapping workflow', async ({ page }) => {
  await page.goto('/pipeline');
  await page.getByText('Upload Custom Data').click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'ci-products.json',
    mimeType: 'application/json',
    buffer: Buffer.from('[{"product_id":"CI001","fat_100g":21},{"product_id":"CI002","fat_100g":16}]'),
  });
  await expect(page.getByText('Profile Data — ci-products.json')).toBeVisible();
  await expect(page.getByText('2 rows × 2 columns', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Map to Ontology/ }).first().click();
  await expect(page.getByText(/Source revision rev_/)).toBeVisible();
  await page.getByRole('button', { name: /Generate & preview candidates/ }).first().click();
  await expect(page.getByText('Step 4 of 6').first()).toBeVisible();
  await expect(page.getByText('Preview Candidates', { exact: true }).first()).toBeVisible();
});

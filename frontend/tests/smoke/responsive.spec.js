// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Responsive smoke test for Phase 44D.
 * Verifies mobile viewport doesn't cause horizontal overflow.
 */

const MOBILE_VIEWPORT = { width: 390, height: 844 };

const MOBILE_ROUTES = [
  '/dashboard',
  '/pipeline',
  '/graph',
  '/settings',
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pto-auth', JSON.stringify({
      username: 'demo',
      name: 'Demo User',
    }));
  });
});

test.describe('Responsive Smoke (390 × 844)', () => {
  for (const route of MOBILE_ROUTES) {
    test(`${route} has no horizontal overflow on mobile`, async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);

      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await expect(page.locator('main')).toBeVisible();

      // No uncaught errors
      expect(errors.filter(e => !e.includes('ResizeObserver'))).toEqual([]);

      // No horizontal scrollbar on body
      const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const clientWidth = await page.evaluate(() => document.body.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // 2px tolerance

      // Content is visible
      const body = await page.textContent('body');
      expect(body?.length).toBeGreaterThan(10);
    });
  }
});

for (const viewport of [{ width: 1280, height: 800 }, MOBILE_VIEWPORT]) {
  test(`pipeline keeps its heading and stepper visible while content scrolls at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/pipeline');
    await page.locator('.pipeline-source-card').filter({ hasText: 'pet_food_products' }).click();
    await page.locator('.pipeline-step-footer button').last().click();
    await expect(page.getByText('Column Profiles')).toBeVisible();

    const header = page.locator('.pipeline-page-header');
    const stepper = page.locator('.pipeline-stepper');
    const workflow = page.locator('.pipeline-workflow');
    const before = await Promise.all([header.boundingBox(), stepper.boundingBox()]);

    await workflow.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => workflow.evaluate(element => element.scrollTop)).toBeGreaterThan(0);

    const after = await Promise.all([header.boundingBox(), stepper.boundingBox()]);
    expect(after[0]?.y).toBeCloseTo(before[0]?.y ?? 0, 0);
    expect(after[1]?.y).toBeCloseTo(before[1]?.y ?? 0, 0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(header.getByText('Data Pipeline')).toBeVisible();
    await expect(stepper.getByText('Profile Data', { exact: true }).first()).toBeVisible();
  });
}

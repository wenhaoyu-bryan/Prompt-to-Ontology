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

      await page.goto(route, { waitUntil: 'networkidle', timeout: 20000 });

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

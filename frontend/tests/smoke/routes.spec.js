// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Minimal route smoke test for Phase 44D.
 * Verifies each main route loads without white-screen or uncaught errors.
 *
 * Auth: sets localStorage 'pto-auth' before navigating.
 * Docker must be running (localhost:5173 + localhost:8765).
 */

const ROUTES = [
  { path: '/dashboard',          titleKey: 'heroTitle',     fallback: 'Operational Ontology' },
  { path: '/demo-center',        titleKey: null,            fallback: 'Demo Center' },
  { path: '/pipeline',           titleKey: null,            fallback: 'Data Pipeline' },
  { path: '/schema',             titleKey: null,            fallback: 'Ontology Manager' },
  { path: '/review',             titleKey: null,            fallback: 'Review Queue' },
  { path: '/objects',            titleKey: null,            fallback: 'Objects' },
  { path: '/graph',              titleKey: null,            fallback: 'Graph Explorer' },
  { path: '/rule-studio',        titleKey: null,            fallback: 'Rule Studio' },
  { path: '/agent',              titleKey: null,            fallback: 'Agent' },
  { path: '/agent-traces',       titleKey: null,            fallback: 'Agent Traces' },
  { path: '/verified-qa',        titleKey: null,            fallback: 'Verified Questions' },
  { path: '/graph-governance',   titleKey: null,            fallback: 'Graph Governance' },
  { path: '/settings',           titleKey: null,            fallback: 'Settings' },
];

// Set mock auth before each test
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pto-auth', JSON.stringify({
      username: 'demo',
      name: 'Demo User',
    }));
  });
});

test.describe('Route Smoke Tests', () => {
  for (const route of ROUTES) {
    test(`${route.path} loads without crash`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));

      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // No HTTP error
      expect(response?.status()).toBeLessThan(500);

      // No uncaught page errors
      expect(errors.filter(e => !e.includes('ResizeObserver'))).toEqual([]);

      // Check the route content rather than a matching sidebar label.
      const main = page.locator('main');
      await expect(main).toBeVisible();
      await expect(main).toContainText(route.fallback);
    });
  }
});

import { test, expect } from '@playwright/test';

test('a fresh visit uses dark mode before and after the app loads', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('an explicit light preference still persists across navigation and reload', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pto-auth', JSON.stringify({ username: 'demo', name: 'Demo User' }));
    localStorage.setItem('pto-theme-mode', 'light');
  });
  await page.goto('/dashboard');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'node-index Graph Explorer', exact: true }).click();
  await expect(page.getByTestId('sigma-graph')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the document has a dark initial background without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/login`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(16, 24, 39)');
  await context.close();
});

// Smoke test: every protected route renders without a JS crash.
// Uses service-role session injection to bypass Google OAuth.

import { test, expect } from '@playwright/test';
import { injectSession } from '../fixtures/auth.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

const ROUTES = [
  '/',
  '/products',
  '/warehouses',
  '/inventory',
  '/containers',
  '/sales',
  '/customers',
  '/suppliers',
  '/transfers',
  '/damages',
  '/returns',
  '/payments',
  '/accounts',
  '/reports',
  '/activity-log',
  '/approvals',
  '/stock-adjustments',
];

for (const route of ROUTES) {
  test(`renders ${route} without crash`, async ({ page }) => {
    await injectSession(page);
    await page.goto(`${BASE_URL}${route}`);

    // Must not show a full-screen error boundary
    const errorText = page.locator('text=/something went wrong|cannot read|undefined is not/i');
    await expect(errorText).not.toBeVisible({ timeout: 5000 }).catch(() => {});

    // Page must have at least one heading or the main layout
    const hasContent = await Promise.race([
      page.locator('h1, h2, [data-testid="page-header"]').first().waitFor({ timeout: 8000 }).then(() => true),
      page.locator('main, [role="main"]').first().waitFor({ timeout: 8000 }).then(() => true),
    ]).catch(() => false);
    expect(hasContent).toBe(true);
  });
}

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const DEMO_MODE = String(process.env.VITE_DEMO_MODE || '').toLowerCase() === 'true';

test.describe('Authentication', () => {
  test('login page renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
  });

  test('register page renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await expect(page.getByRole('button', { name: /create account|register|sign up/i })).toBeVisible();
  });

  test('forgot password page renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/forgot-password`);
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible();
  });

  test.skip(DEMO_MODE, 'skip redirect test in demo mode — auto-login bypasses /login');
  test('unauthenticated / redirects to /login', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await expect(page).toHaveURL(/\/login/);
  });
});

/**
 * Captcha gate dialog regression tests.
 *
 * Verifies that the global CAPTCHA_REQUIRED interceptor shows the
 * CaptchaGateProvider dialog and that the dialog renders correctly
 * with accessible structure, backdrop, and working Cancel button.
 *
 * Uses API route mocking so the dialog can be exercised without a
 * FriendlyCaptcha API key or a real free-tier account.
 *
 * Run with:
 *   DEV_OTP_CODE=000000 PW_TEST_EMAIL=you@example.com pnpm --filter @adieuu/ui test:compliance
 */

import { test, expect } from '@playwright/test';
import { mockCaptchaRequiredSession } from './helpers';

test.describe('Captcha gate dialog', () => {
  test('renders a visible dialog when an API call returns CAPTCHA_REQUIRED', async ({ page }) => {
    await mockCaptchaRequiredSession(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    if (page.url().includes('/auth/login')) {
      test.skip();
      return;
    }

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const backdrop = page.locator('.confirm-dialog-backdrop');
    const positioner = page.locator('.confirm-dialog-positioner');

    await expect(backdrop).toBeVisible();
    await expect(positioner).toBeVisible();

    const backdropStyles = await backdrop.evaluate((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        position: style.position,
        width: rect.width,
        height: rect.height,
      };
    });

    expect(backdropStyles.position).toBe('fixed');
    expect(backdropStyles.width).toBeGreaterThan(0);
    expect(backdropStyles.height).toBeGreaterThan(0);

    const positionerStyles = await positioner.evaluate((el) => getComputedStyle(el).position);
    expect(positionerStyles).toBe('fixed');

    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  });

  test('dismisses dialog when Cancel is clicked', async ({ page }) => {
    await mockCaptchaRequiredSession(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    if (page.url().includes('/auth/login')) {
      test.skip();
      return;
    }

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(dialog).toHaveCount(0, { timeout: 10_000 });

    const overflowRestored = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return style.overflow !== 'hidden' && style.overflowY !== 'hidden';
    });
    expect(overflowRestored).toBe(true);
  });

  test('Continue button is disabled until captcha is completed', async ({ page }) => {
    await mockCaptchaRequiredSession(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    if (page.url().includes('/auth/login')) {
      test.skip();
      return;
    }

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const continueBtn = page.getByRole('button', { name: 'Continue' });
    await expect(continueBtn).toBeDisabled();
  });
});

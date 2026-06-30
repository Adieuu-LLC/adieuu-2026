/**
 * VPN compliance modal regression tests.
 *
 * Uses a session API mock so the modal can be exercised without
 * DEV_FORCE_ANONYMOUS_IP on the API.
 *
 * Run with:
 *   DEV_OTP_CODE=000000 PW_TEST_EMAIL=you@example.com pnpm --filter @adieuu/ui test:compliance
 */

import { test, expect } from '@playwright/test';
import { mockVpnAttestationSession } from './helpers';

test.describe('VPN compliance modal', () => {
  test('renders a visible, fixed-position modal when attestation is required', async ({ page }) => {
    await mockVpnAttestationSession(page, { clearAfterSubmit: true });
    await page.goto('/about', { waitUntil: 'networkidle' });

    if (page.url().includes('/auth/login')) {
      test.skip();
      return;
    }

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const backdrop = page.locator('.geofence-modal-backdrop');
    const positioner = page.locator('.geofence-modal-positioner');

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

    await expect(page.getByRole('button', { name: "No, I'm not" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Yes, I am' })).toBeVisible();
  });

  test('allows completing attestation and restores page scroll', async ({ page }) => {
    await mockVpnAttestationSession(page, { clearAfterSubmit: true });
    await page.goto('/about', { waitUntil: 'networkidle' });

    if (page.url().includes('/auth/login')) {
      test.skip();
      return;
    }

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: "No, I'm not" }).click();

    await expect(dialog).toHaveCount(0, { timeout: 10_000 });

    const scrollWorks = await page.evaluate(() => {
      const before = window.scrollY;
      window.scrollTo(0, before + 120);
      return window.scrollY > before;
    });
    expect(scrollWorks).toBe(true);
  });
});

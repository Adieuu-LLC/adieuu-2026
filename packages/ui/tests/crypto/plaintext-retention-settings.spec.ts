/**
 * Message-search plaintext retention settings tests.
 *
 * Client-side message search necessarily produces temporary decrypted
 * plaintext for indexing. The privacy control that governs how long that
 * plaintext is retained is the safety valve for that tradeoff, so the UI
 * must expose the full range of retention options with wipe-immediately
 * available as the strictest choice.
 *
 * The card only renders for a logged-in identity; when the test session is
 * account-only these tests skip rather than fail.
 *
 * Run with:
 *   DEV_OTP_CODE=000000 PW_TEST_EMAIL=you@example.com pnpm --filter @adieuu/ui test:crypto
 */

import { test, expect } from '@playwright/test';
import { gotoAuthenticated } from './helpers';

test.describe('Message search plaintext retention', () => {
  test('exposes retention options including immediate wipe', async ({ page }) => {
    if (!(await gotoAuthenticated(page, '/identity/privacy'))) {
      test.skip();
      return;
    }

    const searchSection = page.locator('[data-section="message-search"]');
    if ((await searchSection.count()) === 0) {
      // Requires an identity session; account-only sessions don't render it.
      test.skip();
      return;
    }

    await expect(searchSection).toBeVisible();

    const retentionSelect = searchSection.locator('select').first();
    await expect(retentionSelect).toBeVisible();

    const optionValues = await retentionSelect
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));

    // Strictest option must exist: wipe decrypted search cache immediately.
    expect(optionValues).toContain('wipe_immediately');
    // Timed retention tiers must exist so users can bound plaintext lifetime.
    expect(optionValues).toEqual(
      expect.arrayContaining(['after_1h', 'after_1d', 'after_7d', 'after_30d'])
    );
  });

  test('exposes cache mode control with on-demand indexing', async ({ page }) => {
    if (!(await gotoAuthenticated(page, '/identity/privacy'))) {
      test.skip();
      return;
    }

    const searchSection = page.locator('[data-section="message-search"]');
    if ((await searchSection.count()) === 0) {
      test.skip();
      return;
    }

    const modeSelect = searchSection.locator('select').nth(1);
    await expect(modeSelect).toBeVisible();

    const optionValues = await modeSelect
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));

    expect(optionValues).toEqual(expect.arrayContaining(['on_demand', 'warm']));
  });
});

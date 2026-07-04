/**
 * Forward secrecy settings UI regression tests.
 *
 * Covers the E2E-crypto-relevant settings surface on the Privacy page:
 *   - Forward Secrecy tab renders the FS configuration panel
 *   - "Clear local message cache" copy warns about the local FS tradeoff
 *     (persisted session keys / cached plaintext weakening forward secrecy)
 *   - Destructive FS options (cache clearing, immediate key deletion) are
 *     gated behind explicit confirmation dialogs and cancel is a no-op
 *
 * These tests exercise the settings UI with an account-level session; the
 * FS panel renders with per-identity defaults even before identity login.
 *
 * Run with:
 *   DEV_OTP_CODE=000000 PW_TEST_EMAIL=you@example.com pnpm --filter @adieuu/ui test:crypto
 */

import { test, expect } from '@playwright/test';
import { openForwardSecrecyTab } from './helpers';

test.describe('Forward secrecy settings', () => {
  test('renders the FS configuration panel with all options', async ({ page }) => {
    if (!(await openForwardSecrecyTab(page))) {
      test.skip();
      return;
    }

    await expect(page.getByText('Enable Forward Secrecy by default')).toBeVisible();

    // All six security levels are offered
    for (const level of ['Very Lax', 'Lax', 'Standard', 'Medium', 'High', 'Maximum']) {
      await expect(
        page.locator('.activity-radio-title', { hasText: new RegExp(`^${level}$`) })
      ).toBeVisible();
    }

    // All three deletion policies are offered
    await expect(page.getByText('After Sync (recommended)')).toBeVisible();
    await expect(page.getByText('Deletes retired keys on a strict timer', { exact: false })).toBeVisible();
    await expect(page.getByText('Deletes retired keys immediately on rotation', { exact: false })).toBeVisible();

    // Manual rotation and retired-key purge controls exist
    await expect(page.getByRole('button', { name: 'Rotate Keys Now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Purge Retired Keys' })).toBeVisible();
  });

  test('cache-clearing copy explains the local forward secrecy tradeoff', async ({ page }) => {
    if (!(await openForwardSecrecyTab(page))) {
      test.skip();
      return;
    }

    const checkbox = page.locator('.fs-cache-clear-checkbox').first();
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toContainText(
      'Also clear local message cache when keys are deleted'
    );

    // The hint must spell out that leaving this off keeps decrypted copies
    // on the device after key deletion, weakening forward secrecy locally.
    await expect(checkbox).toContainText('stay cached on this device after keys are deleted');
    await expect(checkbox).toContainText('weakens forward secrecy locally');
  });

  test('enabling cache clearing requires explicit confirmation and cancel is a no-op', async ({ page }) => {
    if (!(await openForwardSecrecyTab(page))) {
      test.skip();
      return;
    }

    const checkbox = page.locator('.fs-cache-clear-checkbox').first();
    await expect(checkbox).toHaveAttribute('data-state', 'unchecked');

    await checkbox.click();

    const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'));
    await expect(dialog.first()).toBeVisible({ timeout: 10_000 });
    await expect(dialog.first()).toContainText('Enable cache clearing on rotation?');
    await expect(dialog.first()).toContainText('permanently unreadable');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog.first()).not.toBeVisible({ timeout: 10_000 });

    // Cancel must not flip the setting
    await expect(checkbox).toHaveAttribute('data-state', 'unchecked');
  });

  test('confirming cache clearing enables the setting', async ({ page }) => {
    if (!(await openForwardSecrecyTab(page))) {
      test.skip();
      return;
    }

    const checkbox = page.locator('.fs-cache-clear-checkbox').first();
    await expect(checkbox).toHaveAttribute('data-state', 'unchecked');

    await checkbox.click();

    const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'));
    await expect(dialog.first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Enable cache clearing' }).click();
    await expect(dialog.first()).not.toBeVisible({ timeout: 10_000 });

    await expect(checkbox).toHaveAttribute('data-state', 'checked');

    // Turning it back off does not require confirmation (safe direction)
    await checkbox.click();
    await expect(checkbox).toHaveAttribute('data-state', 'unchecked');
  });

  test('selecting immediate key deletion requires explicit confirmation', async ({ page }) => {
    if (!(await openForwardSecrecyTab(page))) {
      test.skip();
      return;
    }

    const immediateRadio = page
      .locator('.activity-radio-item')
      .filter({ hasText: 'Deletes retired keys immediately on rotation' });
    await expect(immediateRadio).toBeVisible();
    await immediateRadio.click();

    const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'));
    await expect(dialog.first()).toBeVisible({ timeout: 10_000 });
    await expect(dialog.first()).toContainText('Enable immediate deletion?');
    await expect(dialog.first()).toContainText('This cannot be undone');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog.first()).not.toBeVisible({ timeout: 10_000 });

    // Policy must remain on the recommended default after cancel
    const afterSyncRadio = page
      .locator('.activity-radio-item')
      .filter({ hasText: 'After Sync (recommended)' });
    await expect(afterSyncRadio).toHaveAttribute('data-state', 'checked');
  });

  test('purging retired keys requires confirmation and offers cache clearing', async ({ page }) => {
    if (!(await openForwardSecrecyTab(page))) {
      test.skip();
      return;
    }

    await page.getByRole('button', { name: 'Purge Retired Keys' }).click();

    const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'));
    await expect(dialog.first()).toBeVisible({ timeout: 10_000 });
    await expect(dialog.first()).toContainText('Purge all retired keys?');
    await expect(dialog.first()).toContainText('will become unreadable');

    // The purge dialog exposes the optional tier-up: also wipe cached plaintext
    await expect(dialog.first()).toContainText('Also clear local message cache');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog.first()).not.toBeVisible({ timeout: 10_000 });
  });
});

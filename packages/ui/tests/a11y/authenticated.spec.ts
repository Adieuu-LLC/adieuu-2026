/**
 * Accessibility audits for authenticated pages.
 *
 * These tests require a valid session (see auth.setup.ts).
 * They run against pages that need authentication — account, conversations,
 * settings, etc.
 *
 * Run with: PW_TEST_EMAIL=you@example.com DEV_OTP_CODE=000000 pnpm --filter @adieuu/ui test:a11y
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function getCriticalViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
}

function formatViolations(violations: Awaited<ReturnType<typeof getCriticalViolations>>) {
  return violations.map(
    (v) =>
      `[${v.impact}] ${v.id}: ${v.description}\n` +
      v.nodes.map((n) => `  - ${n.html.slice(0, 120)}`).join('\n')
  ).join('\n\n');
}

// ---------------------------------------------------------------------------
// Authenticated page scans
// ---------------------------------------------------------------------------

test.describe('authenticated page scans', () => {
  const PAGES = [
    { name: 'Account Overview', path: '/account/overview' },
    { name: 'Account Security', path: '/account/security' },
    { name: 'Account Subscription', path: '/account/subscription' },
    { name: 'Identity Appearance', path: '/identity/appearance' },
    { name: 'Conversations (new)', path: '/conversations/new' },
    { name: 'Support Tickets', path: '/support' },
    { name: 'Theme Browser', path: '/account/themes' },
  ];

  for (const { name, path } of PAGES) {
    test(`${name} (${path}) — no critical/serious violations`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'networkidle' });

      // If redirected to login, session is invalid — skip gracefully
      if (page.url().includes('/auth/login')) {
        test.skip();
        return;
      }

      const violations = await getCriticalViolations(page);

      if (violations.length > 0) {
        console.error(`A11y violations on ${path}:\n${formatViolations(violations)}`);
      }
      expect(violations).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Sidebar navigation a11y (requires authenticated shell)
// ---------------------------------------------------------------------------

test.describe('sidebar navigation', () => {
  test('sidebar has correct ARIA landmarks and roles', async ({ page }) => {
    await page.goto('/about', { waitUntil: 'networkidle' });

    if (page.url().includes('/auth/login')) {
      test.skip();
      return;
    }

    const sidebar = page.locator('aside, nav[aria-label]').first();
    expect(await sidebar.count()).toBeGreaterThan(0);

    // Active link should have aria-current
    const activeLink = page.locator('[aria-current="page"]');
    if (await activeLink.count() > 0) {
      const tagName = await activeLink.first().evaluate((el) => el.tagName.toLowerCase());
      expect(['a', 'button']).toContain(tagName);
    }
  });

  test('sidebar is keyboard navigable', async ({ page }) => {
    await page.goto('/about', { waitUntil: 'networkidle' });

    if (page.url().includes('/auth/login')) {
      test.skip();
      return;
    }

    // Tab into sidebar content
    const sidebarLinks = page.locator('.sidebar-item a, .sidebar-item button');
    const count = await sidebarLinks.count();
    expect(count).toBeGreaterThan(0);

    await sidebarLinks.first().focus();
    const focused = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
    expect(['a', 'button']).toContain(focused);
  });
});

// ---------------------------------------------------------------------------
// Color contrast on authenticated pages
// ---------------------------------------------------------------------------

test.describe('authenticated color contrast', () => {
  const PAGES = ['/account/overview', '/conversations/new'];

  for (const path of PAGES) {
    test(`${path} passes color contrast`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      if (page.url().includes('/auth/login')) {
        test.skip();
        return;
      }

      const results = await new AxeBuilder({ page })
        .withRules(['color-contrast'])
        .analyze();

      const failures = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      if (failures.length > 0) {
        console.error(`Contrast failures on ${path}:\n${formatViolations(failures)}`);
      }
      expect(failures).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Form accessibility on account pages
// ---------------------------------------------------------------------------

test.describe('account form accessibility', () => {
  test('account overview inputs have labels', async ({ page }) => {
    await page.goto('/account/overview', { waitUntil: 'networkidle' });

    if (page.url().includes('/auth/login')) {
      test.skip();
      return;
    }

    const unlabeledInputs = await page.$$eval(
      'input:not([type="hidden"]):not([type="submit"]):visible',
      (inputs) =>
        inputs.filter((input) => {
          const id = input.id;
          const ariaLabel = input.getAttribute('aria-label');
          const ariaLabelledby = input.getAttribute('aria-labelledby');
          const title = input.getAttribute('title');
          const hasLabel = id && document.querySelector(`label[for="${id}"]`);
          const parentLabel = input.closest('label');
          return !ariaLabel && !ariaLabelledby && !title && !hasLabel && !parentLabel;
        })
        .map((input) => input.outerHTML.slice(0, 100))
    );

    expect(unlabeledInputs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Modal / dialog focus management
// ---------------------------------------------------------------------------

test.describe('dialog accessibility', () => {
  test('opening a settings dialog traps focus', async ({ page }) => {
    await page.goto('/account/security', { waitUntil: 'networkidle' });

    if (page.url().includes('/auth/login')) {
      test.skip();
      return;
    }

    // Look for a button that opens a modal
    const modalTrigger = page.locator('button:has-text("Change"), button:has-text("Edit"), button:has-text("Setup")').first();
    expect(await modalTrigger.count()).toBeGreaterThan(0);

    await modalTrigger.click();
    await page.waitForTimeout(300);

    const dialog = page.locator('[role="dialog"]:visible');
    expect(await dialog.count()).toBeGreaterThan(0);

    // Verify dialog has aria-modal
    expect(await dialog.getAttribute('aria-modal')).toBe('true');

    // Verify focus is inside the dialog
    const focusInsideDialog = await dialog.locator(':focus').count();
    expect(focusInsideDialog).toBeGreaterThan(0);

    // Tab through and verify focus stays trapped
    const focusable = dialog.locator(
      'button:visible, [href]:visible, input:visible, select:visible, textarea:visible'
    );
    const focusableCount = await focusable.count();

    if (focusableCount >= 2) {
      for (let i = 0; i < focusableCount + 1; i++) {
        await page.keyboard.press('Tab');
      }
      const stillInside = await dialog.locator(':focus').count();
      expect(stillInside).toBeGreaterThan(0);
    }

    // Escape should close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const dialogAfterEscape = page.locator('[role="dialog"]:visible');
    expect(await dialogAfterEscape.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// VPN compliance modal accessibility
// ---------------------------------------------------------------------------

test.describe('VPN compliance dialog accessibility', () => {
  test('traps focus and passes axe scan when attestation is required', async ({ page }) => {
    const { mockVpnAttestationSession } = await import('../compliance/helpers');
    await mockVpnAttestationSession(page);
    await page.goto('/about', { waitUntil: 'networkidle' });

    if (page.url().includes('/auth/login')) {
      test.skip();
      return;
    }

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    expect(await dialog.getAttribute('aria-modal')).toBe('true');

    const focusInsideDialog = await dialog.locator(':focus').count();
    expect(focusInsideDialog).toBeGreaterThan(0);

    const focusable = dialog.locator(
      'button:visible, [href]:visible, input:visible, select:visible, textarea:visible',
    );
    const focusableCount = await focusable.count();
    expect(focusableCount).toBeGreaterThan(0);

    if (focusableCount >= 2) {
      for (let i = 0; i < focusableCount + 1; i++) {
        await page.keyboard.press('Tab');
      }
      const stillInside = await dialog.locator(':focus').count();
      expect(stillInside).toBeGreaterThan(0);
    }

    const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(WCAG_TAGS).analyze();
    const violations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    if (violations.length > 0) {
      console.error(`A11y violations on VPN compliance dialog:\n${formatViolations(violations)}`);
    }
    expect(violations).toHaveLength(0);
  });
});

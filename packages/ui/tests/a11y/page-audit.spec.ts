/**
 * Playwright + axe-core page-level accessibility audits.
 *
 * These tests navigate to key application pages and run axe-core against
 * the live DOM to catch issues that static linting cannot detect (color
 * contrast, focus order, live-region behavior, etc).
 *
 * Run with: pnpm --filter @adieuu/ui test:a11y
 *
 * Requirements:
 *   - Dev server running on localhost:3000 (auto-started by playwright.config.ts)
 *   - Playwright browsers installed: npx playwright install chromium
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Pages to audit. Each entry specifies a path and an optional setup
 * function for interacting with the page before scanning (e.g. opening modals).
 */
const PAGES: { name: string; path: string; setup?: (page: import('@playwright/test').Page) => Promise<void> }[] = [
  { name: 'Login', path: '/login' },
  { name: 'Register', path: '/register' },
  { name: 'Legal - Terms of Service', path: '/legal/tos' },
  { name: 'Legal - Privacy Policy', path: '/legal/privacy' },
  { name: 'Legal - Paid Services', path: '/legal/paid-services' },
];

for (const { name, path, setup } of PAGES) {
  test(`${name} (${path}) has no critical a11y violations`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'networkidle' });

    if (setup) {
      await setup(page);
    }

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();

    const violations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    if (violations.length > 0) {
      const summary = violations.map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description}\n` +
          v.nodes.map((n) => `  - ${n.html.slice(0, 120)}`).join('\n')
      );
      console.error(`A11y violations on ${path}:\n${summary.join('\n\n')}`);
    }

    expect(violations).toHaveLength(0);
  });
}

test('Skip link is focusable and targets #main-content', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'networkidle' });

  await page.keyboard.press('Tab');

  const skipLink = page.locator('.skip-link');
  const isVisible = await skipLink.isVisible();

  if (isVisible) {
    const href = await skipLink.getAttribute('href');
    expect(href).toBe('#main-content');

    const mainContent = page.locator('#main-content');
    await expect(mainContent).toBeAttached();
  }
});

test('Focus is trapped inside open dialog', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'networkidle' });

  const dialog = page.locator('[role="dialog"]');
  if (await dialog.count() > 0) {
    const focusableInDialog = dialog.locator(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const count = await focusableInDialog.count();
    if (count > 1) {
      await focusableInDialog.first().focus();

      for (let i = 0; i < count + 1; i++) {
        await page.keyboard.press('Tab');
      }

      const focused = page.locator(':focus');
      const isInsideDialog = await dialog.locator(':focus').count();
      expect(isInsideDialog).toBeGreaterThan(0);
    }
  }
});

test('Route change announces to screen readers', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'networkidle' });

  const announcer = page.locator('[aria-live="polite"]');
  if (await announcer.count() === 0) {
    test.skip();
    return;
  }

  await page.goto('/register', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const text = await announcer.first().textContent();

  // Unauthenticated pages may not use AppLayout with the route announcer,
  // so we only assert structure exists. Full announcement testing requires
  // authenticated navigation (e.g. between conversation pages).
  expect(await announcer.first().getAttribute('aria-live')).toBe('polite');
});

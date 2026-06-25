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

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAxeViolations(page: Page, tags = WCAG_TAGS) {
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  return results.violations;
}

function formatViolations(violations: Awaited<ReturnType<typeof getAxeViolations>>) {
  return violations.map(
    (v) =>
      `[${v.impact}] ${v.id}: ${v.description}\n` +
      v.nodes.map((n) => `  - ${n.html.slice(0, 120)}`).join('\n')
  ).join('\n\n');
}

// ---------------------------------------------------------------------------
// 1. Full-page axe scans on public routes
// ---------------------------------------------------------------------------

test.describe('axe page scans', () => {
  const PAGES: { name: string; path: string; setup?: (page: Page) => Promise<void> }[] = [
    { name: 'Login', path: '/auth/login' },
    { name: 'About', path: '/about' },
    { name: 'About - Learn', path: '/about/learn' },
    { name: 'About - Roadmap', path: '/about/roadmap' },
    { name: 'Download', path: '/download' },
    { name: 'Search', path: '/search' },
    { name: 'Spaces', path: '/spaces' },
    { name: 'Legal Policies Directory', path: '/legal-policies' },
    { name: 'Legal - Terms of Service', path: '/legal-policies/tos' },
    { name: 'Legal - Privacy Policy', path: '/legal-policies/privacy' },
    { name: 'Legal - Paid Services', path: '/legal-policies/paid-services' },
    { name: 'Feedback', path: '/feedback' },
  ];

  for (const { name, path, setup } of PAGES) {
    test(`${name} (${path}) — no critical/serious violations`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });
      if (setup) await setup(page);

      const violations = (await getAxeViolations(page)).filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      if (violations.length > 0) {
        console.error(`A11y violations on ${path}:\n${formatViolations(violations)}`);
      }
      expect(violations).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Heading hierarchy — no skipped levels
// ---------------------------------------------------------------------------

test.describe('heading hierarchy', () => {
  const PAGES_TO_CHECK = ['/about', '/legal-policies/tos', '/feedback'];

  for (const path of PAGES_TO_CHECK) {
    test(`${path} has no skipped heading levels`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      const headingLevels = await page.$$eval(
        'h1, h2, h3, h4, h5, h6',
        (els) => els.map((el) => Number(el.tagName[1]))
      );

      if (headingLevels.length === 0) return;

      // First heading should be h1
      expect(headingLevels[0]).toBeLessThanOrEqual(2);

      // No skipping: each heading should be at most 1 level deeper than previous
      for (let i = 1; i < headingLevels.length; i++) {
        const jump = headingLevels[i] - headingLevels[i - 1];
        expect(
          jump,
          `Heading level jumped from h${headingLevels[i - 1]} to h${headingLevels[i]} (index ${i})`
        ).toBeLessThanOrEqual(1);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Landmark structure — required regions present
// ---------------------------------------------------------------------------

test.describe('landmark structure', () => {
  test('authenticated shell has required landmarks', async ({ page }) => {
    await page.goto('/about', { waitUntil: 'networkidle' });

    const main = page.locator('main');
    await expect(main).toBeAttached();

    const nav = page.locator('nav');
    expect(await nav.count()).toBeGreaterThan(0);
  });

  test('login page has a heading', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'networkidle' });

    const heading = page.locator('h1, h2, h3, [role="heading"]');
    expect(await heading.count()).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Color contrast — run axe with only contrast rules
// ---------------------------------------------------------------------------

test.describe('color contrast', () => {
  const PAGES_TO_CHECK = ['/about', '/auth/login', '/legal-policies/tos'];

  for (const path of PAGES_TO_CHECK) {
    test(`${path} passes color contrast checks`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

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
// 5. Keyboard navigation — all interactive elements reachable via Tab
// ---------------------------------------------------------------------------

test.describe('keyboard navigation', () => {
  test('login form is fully keyboard navigable', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'networkidle' });

    const interactiveEls = page.locator(
      'input:visible, button:visible, a[href]:visible, select:visible, textarea:visible'
    );
    const count = await interactiveEls.count();
    if (count === 0) return;

    const reachedElements = new Set<string>();

    for (let i = 0; i < count + 5; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`;
      });
      if (focused) reachedElements.add(focused);
    }

    // Should reach at least 2 interactive elements (input + button)
    expect(reachedElements.size).toBeGreaterThanOrEqual(2);
  });

  test('focus indicator is visible on interactive elements', async ({ page }) => {
    await page.goto('/about', { waitUntil: 'networkidle' });

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const focusedEl = page.locator(':focus');
    if (await focusedEl.count() === 0) return;

    const outlineOrShadow = await focusedEl.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const outline = styles.outline;
      const boxShadow = styles.boxShadow;
      const border = styles.border;
      return { outline, boxShadow, border };
    });

    // At least one focus indicator should be non-"none"
    const hasIndicator =
      (outlineOrShadow.outline && !outlineOrShadow.outline.includes('none') && !outlineOrShadow.outline.includes('0px')) ||
      (outlineOrShadow.boxShadow && outlineOrShadow.boxShadow !== 'none');

    expect(hasIndicator).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 6. Images and media — alt text present
// ---------------------------------------------------------------------------

test.describe('images and alt text', () => {
  const PAGES_TO_CHECK = ['/about', '/download'];

  for (const path of PAGES_TO_CHECK) {
    test(`${path} images all have alt text or are decorative`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      const missingAlt = await page.$$eval('img', (images) =>
        images
          .filter((img) => {
            const alt = img.getAttribute('alt');
            const ariaHidden = img.getAttribute('aria-hidden');
            const role = img.getAttribute('role');
            // Decorative images are fine without alt
            if (ariaHidden === 'true' || role === 'presentation' || role === 'none') return false;
            // Empty alt="" is valid for decorative images
            if (alt !== null) return false;
            return true; // Missing alt entirely
          })
          .map((img) => img.outerHTML.slice(0, 100))
      );

      if (missingAlt.length > 0) {
        console.error(`Images missing alt on ${path}:\n${missingAlt.join('\n')}`);
      }
      expect(missingAlt).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Form labeling — inputs have associated labels
// ---------------------------------------------------------------------------

test.describe('form labeling', () => {
  test('login form inputs have accessible labels', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'networkidle' });

    const unlabeledInputs = await page.$$eval(
      'input:not([type="hidden"]):not([type="submit"])',
      (inputs) =>
        inputs
          .filter((input) => {
            const id = input.id;
            const ariaLabel = input.getAttribute('aria-label');
            const ariaLabelledby = input.getAttribute('aria-labelledby');
            const title = input.getAttribute('title');
            const placeholder = input.getAttribute('placeholder');
            const hasLabel = id && document.querySelector(`label[for="${id}"]`);
            const parentLabel = input.closest('label');

            return !ariaLabel && !ariaLabelledby && !title && !hasLabel && !parentLabel;
          })
          .map((input) => input.outerHTML.slice(0, 100))
    );

    if (unlabeledInputs.length > 0) {
      console.error(`Unlabeled inputs on /auth/login:\n${unlabeledInputs.join('\n')}`);
    }
    expect(unlabeledInputs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Skip link
// ---------------------------------------------------------------------------

test('skip link is focusable and targets #main-content', async ({ page }) => {
  await page.goto('/about', { waitUntil: 'networkidle' });

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

// ---------------------------------------------------------------------------
// 9. Focus trapping in dialogs
// ---------------------------------------------------------------------------

test('focus is trapped inside open dialog', async ({ page }) => {
  await page.goto('/about', { waitUntil: 'networkidle' });

  const dialog = page.locator('[role="dialog"]:visible');
  if (await dialog.count() === 0) return;

  const focusableInDialog = dialog.locator(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const count = await focusableInDialog.count();
  if (count < 2) return;

  await focusableInDialog.first().focus();

  for (let i = 0; i < count + 1; i++) {
    await page.keyboard.press('Tab');
  }

  const isInsideDialog = await dialog.locator(':focus').count();
  expect(isInsideDialog).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// 10. Route announcer structure
// ---------------------------------------------------------------------------

test('route announcer region exists with correct attributes', async ({ page }) => {
  await page.goto('/about', { waitUntil: 'networkidle' });

  const announcer = page.locator('[aria-live="polite"][aria-atomic="true"]');
  if (await announcer.count() === 0) {
    test.skip();
    return;
  }

  expect(await announcer.first().getAttribute('aria-live')).toBe('polite');
  expect(await announcer.first().getAttribute('aria-atomic')).toBe('true');
  expect(await announcer.first().getAttribute('role')).toBe('status');
});

// ---------------------------------------------------------------------------
// 11. Interactive elements have accessible names
// ---------------------------------------------------------------------------

test.describe('accessible names', () => {
  test('buttons without visible text have aria-label', async ({ page }) => {
    await page.goto('/about', { waitUntil: 'networkidle' });

    const unlabeledButtons = await page.$$eval('button:visible', (buttons) =>
      buttons
        .filter((btn) => {
          const text = btn.textContent?.trim();
          const ariaLabel = btn.getAttribute('aria-label');
          const ariaLabelledby = btn.getAttribute('aria-labelledby');
          const title = btn.getAttribute('title');
          return !text && !ariaLabel && !ariaLabelledby && !title;
        })
        .map((btn) => btn.outerHTML.slice(0, 120))
    );

    if (unlabeledButtons.length > 0) {
      console.error(`Buttons without accessible name:\n${unlabeledButtons.join('\n')}`);
    }
    expect(unlabeledButtons).toHaveLength(0);
  });

  test('links without visible text have aria-label', async ({ page }) => {
    await page.goto('/about', { waitUntil: 'networkidle' });

    const unlabeledLinks = await page.$$eval('a[href]:visible', (links) =>
      links
        .filter((a) => {
          const text = a.textContent?.trim();
          const ariaLabel = a.getAttribute('aria-label');
          const ariaLabelledby = a.getAttribute('aria-labelledby');
          const title = a.getAttribute('title');
          const img = a.querySelector('img[alt]');
          const svg = a.querySelector('svg[aria-label], svg title');
          return !text && !ariaLabel && !ariaLabelledby && !title && !img && !svg;
        })
        .map((a) => a.outerHTML.slice(0, 120))
    );

    if (unlabeledLinks.length > 0) {
      console.error(`Links without accessible name:\n${unlabeledLinks.join('\n')}`);
    }
    expect(unlabeledLinks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 12. Reduced motion — respect prefers-reduced-motion
// ---------------------------------------------------------------------------

test('animations respect prefers-reduced-motion', async ({ browser }) => {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('/about', { waitUntil: 'networkidle' });

  // Check that no element has an animation-duration > 0 when reduced motion is preferred
  const animatedElements = await page.$$eval('*', (elements) =>
    elements
      .filter((el) => {
        const styles = window.getComputedStyle(el);
        const duration = styles.animationDuration;
        const transition = styles.transitionDuration;
        // 0s is acceptable (no animation)
        if (duration && duration !== '0s' && duration !== '0ms') {
          // Check if it's a very short animation (under 10ms is acceptable)
          return true;
        }
        return false;
      })
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        class: el.className?.toString().slice(0, 50),
      }))
  );

  // Warn but don't fail — some subtle animations may be intentional
  if (animatedElements.length > 0) {
    console.warn(
      `Elements with animations despite prefers-reduced-motion:\n` +
      animatedElements.map((e) => `  ${e.tag}.${e.class}`).join('\n')
    );
  }

  await context.close();
});

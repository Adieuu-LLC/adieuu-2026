/**
 * Shared helpers for the E2E-crypto Playwright project.
 *
 * These tests exercise real UI surfaces (forward secrecy settings, message
 * search retention, logout tiers) that require an authenticated session. The
 * authenticated session is produced by the `setup` project, which depends on
 * DEV_OTP_CODE being set on the API server.
 *
 * When no valid session is available (DEV_OTP_CODE unset, expired cookie,
 * API unreachable), the app redirects to /auth/login. Because that redirect
 * is client-side, the URL may not have updated by the time `networkidle`
 * fires, so we detect the login page by content as well as by URL. Callers
 * skip gracefully in that case rather than reporting a false failure.
 */

import { expect, type Page } from '@playwright/test';

/**
 * Dismisses environment-specific compliance interstitials that can overlay the
 * app and make the background inert (removing it from the accessibility tree).
 *
 * The most common one in local/CI environments is the VPN compliance modal,
 * which fires when the API detects the connection is coming through an
 * anonymizing service. Answering "No, I'm not" to the sanctioned-country and
 * Utah-residency prompts, and continuing past the Utah notice, clears it.
 *
 * Safe to call unconditionally; it no-ops when no modal is present.
 */
export async function dismissComplianceModals(page: Page): Promise<void> {
  const modal = page.locator('.geofence-modal-content');

  // The modal is gated on a session/geo check that can resolve slightly after
  // networkidle, so give it a brief window to appear before deciding it's absent.
  await modal.first().waitFor({ state: 'visible', timeout: 2_500 }).catch(() => {});

  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if ((await modal.count()) === 0) return;

    // The VPN flow can chain: sanctioned-country question -> Utah residency
    // question ("No, I'm not" on both) -> Utah notice ("Continue").
    const noBtn = modal.getByRole('button', { name: "No, I'm not" });
    const continueBtn = modal.getByRole('button', { name: 'Continue' });

    if (await noBtn.count()) {
      await noBtn.first().click().catch(() => {});
    } else if (await continueBtn.count()) {
      await continueBtn.first().click().catch(() => {});
    } else {
      // Unknown modal step; nothing we can safely click.
      return;
    }

    // Wait for this step to resolve (either the modal closes or advances to a
    // new step) before evaluating again.
    await page.waitForTimeout(400);
  }

  // Best-effort final wait for the modal to fully detach.
  await modal.waitFor({ state: 'detached', timeout: 3_000 }).catch(() => {});
}

/**
 * Returns true if the current page is the unauthenticated login screen.
 * Detects both the URL and the login form content to avoid races with the
 * client-side auth redirect.
 */
export async function isOnLoginPage(page: Page): Promise<boolean> {
  if (page.url().includes('/auth/login')) return true;

  const loginHeading = page.getByRole('heading', { name: 'Welcome back' });
  try {
    await loginHeading.waitFor({ state: 'visible', timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Navigate to a route and confirm we have an authenticated session.
 *
 * @returns true when the authenticated page loaded; false when we were
 *          redirected to login (caller should skip).
 */
export async function gotoAuthenticated(page: Page, route: string): Promise<boolean> {
  await page.goto(route, { waitUntil: 'networkidle' });
  if (await isOnLoginPage(page)) return false;
  await dismissComplianceModals(page);
  return true;
}

/**
 * Opens the Privacy page and switches to the Forward Secrecy tab.
 *
 * @returns true when the FS panel is visible; false when unauthenticated.
 */
export async function openForwardSecrecyTab(page: Page): Promise<boolean> {
  if (!(await gotoAuthenticated(page, '/identity/privacy'))) return false;

  const fsTab = page.getByRole('tab', { name: /Forward Secrecy/ });
  try {
    await expect(fsTab).toBeVisible({ timeout: 10_000 });
  } catch {
    // A late-appearing compliance modal may still be covering the tab list
    // (making it inert / absent from the a11y tree). Dismiss once more and retry.
    await dismissComplianceModals(page);
    try {
      await expect(fsTab).toBeVisible({ timeout: 10_000 });
    } catch {
      return false;
    }
  }
  await fsTab.click();
  await expect(
    page.getByRole('heading', { name: 'Forward Secrecy', exact: true })
  ).toBeVisible();
  return true;
}

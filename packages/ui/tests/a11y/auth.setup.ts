/**
 * Playwright setup project: authenticates a test user and saves session state.
 *
 * Prerequisites:
 *   - API server running (localhost:4000 by default) with DEV_OTP_CODE env set
 *   - Set env vars: PW_TEST_EMAIL and DEV_OTP_CODE
 *
 * This performs the full OTP login flow via the API and saves the resulting
 * cookies as storageState for authenticated test projects to reuse.
 */

import { test as setup, request } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE_PATH = path.resolve(__dirname, '.auth/session.json');

export const AUTH_STORAGE_STATE = STORAGE_STATE_PATH;

setup('authenticate', async () => {
  if (process.env.SKIP_A11Y_AUTH === '1') {
    console.log('[a11y auth setup] Skipped (SKIP_A11Y_AUTH=1)');
    return;
  }

  const email = process.env.PW_TEST_EMAIL ?? 'local-test@adieuu.com';
  const otpCode = process.env.DEV_OTP_CODE;
  if (!otpCode) {
    throw new Error('[a11y auth setup] DEV_OTP_CODE must be set for authenticated a11y tests.');
  }
  const baseURL = process.env.PW_API_URL ?? 'http://localhost:3000';

  let context;
  try {
    context = await request.newContext({ baseURL });
  } catch (err) {
    throw new Error(
      `[a11y auth setup] Could not connect to API at ${baseURL}. Authenticated tests require auth setup.`,
    );
  }

  try {
    // Step 1: Request OTP
    const requestRes = await context.post('/api/auth/request', {
      data: { identifier: email, type: 'email' },
    });

    if (!requestRes.ok()) {
      const body = await requestRes.text();
      throw new Error(`Failed to request OTP: ${requestRes.status()} ${body}`);
    }

    // Step 2: Verify OTP (uses DEV_OTP_CODE bypass on the server)
    const verifyRes = await context.post('/api/auth/verify', {
      data: { identifier: email, code: otpCode },
    });

    if (!verifyRes.ok()) {
      const body = await verifyRes.text();
      throw new Error(`Failed to verify OTP: ${verifyRes.status()} ${body}`);
    }

    // Step 3: Save cookie state
    await context.storageState({ path: STORAGE_STATE_PATH });
    console.log('[a11y auth setup] Authentication succeeded, storage state saved.');
  } finally {
    await context.dispose();
  }
});

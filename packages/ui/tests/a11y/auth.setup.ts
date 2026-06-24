/**
 * Playwright global setup: authenticates a test user and saves session state.
 *
 * Prerequisites:
 *   - API server running (localhost:4000 by default) with DEV_OTP_CODE env set
 *   - Set env vars: PW_TEST_EMAIL and DEV_OTP_CODE
 *
 * This performs the full OTP login flow via the API and saves the resulting
 * cookies as storageState for authenticated test projects to reuse.
 */

import { request } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE_PATH = path.resolve(__dirname, '.auth/session.json');

export const AUTH_STORAGE_STATE = STORAGE_STATE_PATH;

async function globalSetup() {
  const email = process.env.PW_TEST_EMAIL ?? 'local-test@adieuu.com';
  const otpCode = process.env.DEV_OTP_CODE ?? '123456';
  const baseURL = process.env.PW_API_URL ?? 'http://localhost:3000';

  const context = await request.newContext({ baseURL });

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
  await context.dispose();

  console.log(`[a11y auth setup] Authenticated as ${email}, state saved to ${STORAGE_STATE_PATH}`);
}

export default globalSetup;

/**
 * Live NCMEC exttest connectivity check. Off by default.
 *
 * Run: CYBERTIPLINE_INTEGRATION_TEST=1 \
 *   CYBERTIPLINE_TEST_USERNAME=... CYBERTIPLINE_TEST_PASSWORD=... \
 *   CYBERTIPLINE_TEST_REPORTER_FIRST_NAME=... CYBERTIPLINE_TEST_REPORTER_LAST_NAME=... \
 *   CYBERTIPLINE_TEST_REPORTER_EMAIL=... \
 *   bun test apps/api/src/services/cybertipline.integration.test.ts
 */

import { describe, expect, test } from 'bun:test';

import {
  CyberTiplineClient,
  CYBERTIPLINE_TEST_BASE_URL,
  loadCyberTiplineCredentialsFromEnv,
} from './cybertipline.service';

const enabled = process.env.CYBERTIPLINE_INTEGRATION_TEST === '1';

function integrationCredentials() {
  return loadCyberTiplineCredentialsFromEnv();
}

describe.skipIf(!enabled)('CyberTipline integration (exttest)', () => {
  test('checkStatus against exttest', async () => {
    const creds = integrationCredentials();
    if (!creds) {
      throw new Error(
        'Set CYBERTIPLINE_TEST_USERNAME, CYBERTIPLINE_TEST_PASSWORD, and reporter name/email env vars',
      );
    }

    const baseUrl = CYBERTIPLINE_TEST_BASE_URL;
    const client = new CyberTiplineClient({ baseUrl, credentials: creds });
    const resp = await client.checkStatus();

    expect(resp.responseCode).toBe(0);
  });
});

describe('CyberTipline integration gate', () => {
  test('skipped unless CYBERTIPLINE_INTEGRATION_TEST=1', () => {
    expect(enabled).toBe(process.env.CYBERTIPLINE_INTEGRATION_TEST === '1');
  });
});

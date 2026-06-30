import type { Page, Route } from '@playwright/test';

const VPN_ATTESTATION = {
  required: true as const,
  step: 'sanctioned_membership' as const,
  sanctionedCountries: [{ countryCode: 'IR', countryName: 'Iran' }],
};

/**
 * Injects VPN attestation into session responses so compliance modals can be
 * tested without DEV_FORCE_ANONYMOUS_IP on the API.
 */
export async function mockVpnAttestationSession(page: Page, options?: { clearAfterSubmit?: boolean }) {
  let attestationActive = true;

  await page.route('**/api/auth/session', async (route: Route) => {
    const response = await route.fetch();
    const json = await response.json();

    if (attestationActive && json?.success && json.data) {
      await route.fulfill({
        response,
        json: {
          ...json,
          data: {
            ...json.data,
            signedToken: undefined,
            compliance: { vpnAttestation: VPN_ATTESTATION },
          },
        },
      });
      return;
    }

    await route.fulfill({ response });
  });

  if (options?.clearAfterSubmit) {
    await page.route('**/api/compliance/vpn-attestation', async (route: Route) => {
      attestationActive = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { next: 'continue' } }),
      });
    });
  }
}

export { VPN_ATTESTATION };

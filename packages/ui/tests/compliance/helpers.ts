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
            compliance: { ...json.data.compliance, vpnAttestation: VPN_ATTESTATION },
          },
        },
      });
      return;
    }

    await route.fulfill({ response });
  });

  if (options?.clearAfterSubmit) {
    await page.route('**/api/compliance/vpn-attestation', async (route: Route) => {
      const body = route.request().postDataJSON();
      const validSteps = ['sanctioned_membership', 'utah_residency'];
      const validAnswers = ['yes', 'no'];

      if (!body || !validSteps.includes(body.step) || !validAnswers.includes(body.answer)) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid request.' } }),
        });
        return;
      }

      attestationActive = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { next: 'continue' } }),
      });
    });
  }
}

/**
 * Injects captchaSitekey into session responses and intercepts one POST
 * endpoint to return 422 CAPTCHA_REQUIRED, triggering the captcha gate dialog.
 */
export async function mockCaptchaRequiredSession(page: Page) {
  let captchaFired = false;

  await page.route('**/api/auth/session', async (route: Route) => {
    const response = await route.fetch();
    const json = await response.json();

    if (json?.success && json.data) {
      await route.fulfill({
        response,
        json: {
          ...json,
          data: {
            ...json.data,
            captchaSitekey: 'FAKE_SITEKEY_FOR_TESTING',
          },
        },
      });
      return;
    }

    await route.fulfill({ response });
  });

  await page.route('**/api/friends/requests/incoming*', async (route: Route) => {
    if (!captchaFired) {
      captchaFired = true;
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'CAPTCHA_REQUIRED',
            message: 'Captcha verification is required for this action.',
            details: { captchaError: 'response_missing' },
          },
        }),
      });
      return;
    }

    const response = await route.fetch();
    await route.fulfill({ response });
  });
}

export { VPN_ATTESTATION };

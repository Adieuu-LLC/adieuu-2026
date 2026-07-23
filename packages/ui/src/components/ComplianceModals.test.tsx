import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as sharedActual from '@adieuu/shared';
import * as configActual from '../config';
import { resetReactI18nextMock, setMockTranslate } from '../test/react-i18next-mock';

setMockTranslate((key) => key);

const mockRefreshSession = mock(() => Promise.resolve({}));
const mockClearAbusiveIpNotice = mock(() => {});

let mockAuthState = {
  session: null as {
    compliance?: {
      vpnAttestation?: {
        required: boolean;
        step: string;
        sanctionedCountries?: Array<{ countryCode: string; countryName: string }>;
      };
    };
  } | null,
  abusiveIpNotice: null as string | null,
  clearAbusiveIpNotice: mockClearAbusiveIpNotice,
  refreshSession: mockRefreshSession,
};

let ComplianceModals: ComponentType;

async function loadComplianceModals() {
  mock.module('../hooks/useAuth', () => ({
    useAuth: () => mockAuthState,
  }));

  mock.module('./Toast', () => ({
    useToast: () => ({ error: mock(() => {}), success: mock(() => {}) }),
  }));

  mock.module('../config', () => ({
    ...configActual,
    useAppConfig: () => ({
      apiBaseUrl: 'http://localhost:3000',
      chatWsUrl: '',
      externalLinkBase: '',
      platform: 'web' as const,
    }),
  }));

  mock.module('@adieuu/shared', () => ({
    ...sharedActual,
    createApiClient: () => ({
      compliance: {
        submitVpnAttestation: mock(() =>
          Promise.resolve({ success: true, data: { next: 'continue' } }),
        ),
      },
    }),
  }));

  ({ ComplianceModals } = await import('./ComplianceModals'));
}

beforeEach(async () => {
  resetReactI18nextMock();
  mockRefreshSession.mockClear();
  mockClearAbusiveIpNotice.mockClear();
  mockAuthState = {
    session: null,
    abusiveIpNotice: null,
    clearAbusiveIpNotice: mockClearAbusiveIpNotice,
    refreshSession: mockRefreshSession,
  };
  await loadComplianceModals();
});

describe('ComplianceModals', () => {
  test('renders VPN modal when attestation is required', () => {
    mockAuthState.session = {
      compliance: {
        vpnAttestation: {
          required: true,
          step: 'sanctioned_membership',
          sanctionedCountries: [{ countryCode: 'IR', countryName: 'Iran' }],
        },
      },
    };
    mockAuthState.abusiveIpNotice = 'Abusive IP detected';

    const html = renderToStaticMarkup(createElement(ComplianceModals));

    expect(html).toContain('compliance.vpn.title');
    expect(html).not.toContain('compliance.abusiveIp.title');
  });

  test('renders abusive IP modal when VPN attestation is not required', () => {
    mockAuthState.session = {
      compliance: {
        vpnAttestation: { required: false, step: 'sanctioned_membership' },
      },
    };
    mockAuthState.abusiveIpNotice = 'Abusive IP detected';

    const html = renderToStaticMarkup(createElement(ComplianceModals));

    expect(html).not.toContain('compliance.vpn.title');
    expect(html).toContain('compliance.abusiveIp.title');
  });

  test('renders nothing when no compliance state is active', () => {
    const html = renderToStaticMarkup(createElement(ComplianceModals));

    expect(html).not.toContain('compliance.vpn.title');
    expect(html).not.toContain('compliance.abusiveIp.title');
  });
});

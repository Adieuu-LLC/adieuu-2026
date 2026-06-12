import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { resetReactI18nextMock, setMockTranslate } from '../test/react-i18next-mock';

setMockTranslate((key) => key);

const mockRefreshSession = mock(() => Promise.resolve({}));
const mockClearAbusiveIpNotice = mock(() => {});

let mockAuthState = {
  session: null as {
    compliance?: {
      vpnAttestation?: { required: boolean; step: string };
    };
  } | null,
  abusiveIpNotice: null as string | null,
  clearAbusiveIpNotice: mockClearAbusiveIpNotice,
  refreshSession: mockRefreshSession,
};

mock.module('../hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

mock.module('./Toast', () => ({
  useToast: () => ({ error: mock(() => {}), success: mock(() => {}) }),
}));

mock.module('./VpnComplianceModal', () => ({
  VpnComplianceModal: () => <div data-testid="vpn-compliance-modal" />,
}));

mock.module('./AbusiveIpModal', () => ({
  AbusiveIpModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="abusive-ip-modal" /> : null,
}));

const { ComplianceModals } = await import('./ComplianceModals');

describe('ComplianceModals', () => {
  beforeEach(() => {
    resetReactI18nextMock();
    mockRefreshSession.mockClear();
    mockClearAbusiveIpNotice.mockClear();
    mockAuthState = {
      session: null,
      abusiveIpNotice: null,
      clearAbusiveIpNotice: mockClearAbusiveIpNotice,
      refreshSession: mockRefreshSession,
    };
  });

  test('renders VPN modal when attestation is required', () => {
    mockAuthState.session = {
      compliance: {
        vpnAttestation: { required: true, step: 'sanctioned_membership' },
      },
    };
    mockAuthState.abusiveIpNotice = 'Abusive IP detected';

    const html = renderToStaticMarkup(<ComplianceModals />);

    expect(html).toContain('data-testid="vpn-compliance-modal"');
    expect(html).not.toContain('data-testid="abusive-ip-modal"');
  });

  test('renders abusive IP modal when VPN attestation is not required', () => {
    mockAuthState.session = {
      compliance: {
        vpnAttestation: { required: false, step: 'sanctioned_membership' },
      },
    };
    mockAuthState.abusiveIpNotice = 'Abusive IP detected';

    const html = renderToStaticMarkup(<ComplianceModals />);

    expect(html).not.toContain('data-testid="vpn-compliance-modal"');
    expect(html).toContain('data-testid="abusive-ip-modal"');
  });

  test('renders nothing when no compliance state is active', () => {
    const html = renderToStaticMarkup(<ComplianceModals />);

    expect(html).not.toContain('data-testid="vpn-compliance-modal"');
    expect(html).not.toContain('data-testid="abusive-ip-modal"');
  });
});

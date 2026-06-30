import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createElement } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import * as sharedActual from '@adieuu/shared';
import * as configActual from '../config';
import { setMockTranslate } from '../test/react-i18next-mock';

const mockSubmitVpnAttestation = mock(() =>
  Promise.resolve({ success: true, data: { next: 'continue' as const } }),
);

setMockTranslate((key) => {
  const labels: Record<string, string> = {
    'compliance.vpn.title': 'VPN compliance check',
    'compliance.vpn.body': 'We need to verify export-control compliance.',
    'compliance.vpn.vpnHint': 'You appear to be using a VPN.',
    'compliance.vpn.sanctionedIntro': 'Sanctioned countries include:',
    'compliance.vpn.sanctionedQuestion': 'Are you a resident of a sanctioned country?',
    'compliance.vpn.yes': 'Yes',
    'compliance.vpn.no': 'No',
  };
  return labels[key] ?? key;
});

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  CSS?: typeof CSS;
};

type VpnComplianceModalComponent = typeof import('./VpnComplianceModal').VpnComplianceModal;

let happy: GlobalWindow;
let prevWindow: typeof globalThis.window;
let prevDocument: typeof globalThis.document;
let prevRaf: typeof globalThis.requestAnimationFrame;
let prevCancelRaf: typeof globalThis.cancelAnimationFrame;
let prevGcs: typeof globalThis.getComputedStyle;
let prevCss: typeof globalThis.CSS;
let VpnComplianceModal: VpnComplianceModalComponent;

const vpnAttestation = {
  required: true as const,
  step: 'sanctioned_membership' as const,
  sanctionedCountries: [
    { countryCode: 'IR', countryName: 'Iran', program: 'OFAC' },
    { countryCode: 'KP', countryName: 'North Korea', program: 'ITAR/EAR' },
  ],
};

async function loadVpnComplianceModal() {
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
        submitVpnAttestation: mockSubmitVpnAttestation,
      },
    }),
  }));

  ({ VpnComplianceModal } = await import('./VpnComplianceModal'));
}

beforeEach(async () => {
  mockSubmitVpnAttestation.mockClear();
  mockSubmitVpnAttestation.mockImplementation(() =>
    Promise.resolve({ success: true, data: { next: 'continue' } }),
  );

  await loadVpnComplianceModal();

  const g = globalThis as G;
  prevWindow = g.window;
  prevDocument = g.document;
  prevRaf = g.requestAnimationFrame;
  prevCancelRaf = g.cancelAnimationFrame;
  prevGcs = g.getComputedStyle;
  prevCss = g.CSS;

  happy = new GlobalWindow({ url: 'https://example.test/' });
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.window = happy as unknown as GlobalWindow & typeof globalThis;
  g.document = happy.document;
  g.requestAnimationFrame = happy.requestAnimationFrame.bind(happy);
  g.cancelAnimationFrame = happy.cancelAnimationFrame.bind(happy);
  g.getComputedStyle = happy.getComputedStyle.bind(happy);
  g.CSS = {
    escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`),
  } as typeof CSS;
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  happy?.close();
  const g = globalThis as G;
  delete g.IS_REACT_ACT_ENVIRONMENT;
  g.window = prevWindow;
  g.document = prevDocument;
  g.requestAnimationFrame = prevRaf;
  g.cancelAnimationFrame = prevCancelRaf;
  g.getComputedStyle = prevGcs;
  g.CSS = prevCss;
});

async function renderOpen(onComplete = mock(() => Promise.resolve())) {
  const container = globalThis.document.createElement('div');
  globalThis.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(VpnComplianceModal, {
        open: true,
        vpnAttestation,
        onComplete,
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
  });
  return { root, container, onComplete };
}

describe('VpnComplianceModal', () => {
  it('renders an accessible dialog with title and action buttons when open', async () => {
    const { root, container } = await renderOpen();

    const dialog = happy.document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(happy.document.body.textContent).toContain('VPN compliance check');
    expect(happy.document.body.textContent).toContain('Iran');
    expect(happy.document.body.textContent).not.toContain('Iran (OFAC)');
    expect(happy.document.body.textContent).toContain('North Korea (ITAR/EAR)');

    const buttons = [...happy.document.querySelectorAll('button')];
    expect(buttons.some((b) => b.textContent?.includes('Yes'))).toBe(true);
    expect(buttons.some((b) => b.textContent?.includes('No'))).toBe(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('submits attestation when user clicks No', async () => {
    const { root, container, onComplete } = await renderOpen();

    const noButton = [...happy.document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('No'),
    );
    expect(noButton).toBeDefined();

    await act(async () => {
      noButton?.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockSubmitVpnAttestation).toHaveBeenCalledWith({
      step: 'sanctioned_membership',
      answer: 'no',
    });
    expect(onComplete).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

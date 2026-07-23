import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { createElement } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { UseDeviceTrustResult, UseDeviceTrustInput } from './useDeviceTrust';

let mockVerificationRecord: { verifiedDisplay: string } | null = null;
let mockFingerprintDisplay: string | null = null;

mock.module('../../services/deviceSignatureVerificationStorage', () => ({
  getDeviceSignatureVerification: mock(async () => mockVerificationRecord),
}));

mock.module('../../services/safetyFingerprintDisplay', () => ({
  getSafetyFingerprintDisplayForDevice: mock(() => mockFingerprintDisplay),
}));

mock.module('../Tooltip', () => ({
  Tooltip: ({ content, children }: { content: string; children: React.ReactNode }) =>
    createElement('span', { 'data-tooltip': content }, children),
}));

mock.module('../../icons/Icon', () => ({
  Icon: ({ name, size }: { name: string; size?: string }) =>
    createElement('span', { 'data-icon': name, 'data-size': size }),
}));

const { useDeviceTrust } = await import('./useDeviceTrust');

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: GlobalWindow;
let root: Root | null = null;

beforeEach(() => {
  mockVerificationRecord = null;
  mockFingerprintDisplay = null;

  happy = new GlobalWindow({ url: 'http://localhost' });
  const g = globalThis as G;
  g.window = happy as unknown as typeof g.window;
  g.document = happy.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  const g = globalThis as G;
  delete g.window;
  delete g.document;
  delete g.IS_REACT_ACT_ENVIRONMENT;
});

function renderHook(input: UseDeviceTrustInput): { current: UseDeviceTrustResult } {
  const ref: { current: UseDeviceTrustResult } = {} as { current: UseDeviceTrustResult };
  function Harness() {
    ref.current = useDeviceTrust(input);
    return null;
  }
  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  act(() => {
    root = createRoot(container as unknown as HTMLElement);
    root.render(createElement(Harness));
  });
  return ref;
}

function baseInput(overrides: Partial<UseDeviceTrustInput> = {}): UseDeviceTrustInput {
  return {
    messageId: 'msg-1',
    fromIdentityId: 'sender-1',
    body: 'hello',
    deleted: false,
    peerPublicKeysById: {},
    verificationRevision: 0,
    ...overrides,
  };
}

describe('useDeviceTrust', () => {
  it('returns null icons when no senderDeviceId', async () => {
    const ref = renderHook(baseInput());
    await act(async () => {});
    expect(ref.current.deviceSignatureTrustIcon).toBeNull();
    expect(ref.current.signatureWarningIcon).toBeNull();
    expect(ref.current.fsDowngradeIcon).toBeNull();
  });

  it('returns null icons when peerPublicKeysById is empty', async () => {
    const ref = renderHook(baseInput({ senderDeviceId: 'dev-1' }));
    await act(async () => {});
    expect(ref.current.deviceSignatureTrustIcon).toBeNull();
  });

  it('returns null trust icon when no verification record exists', async () => {
    mockVerificationRecord = null;
    const ref = renderHook(baseInput({
      senderDeviceId: 'dev-1',
      peerPublicKeysById: { 'sender-1': { identityKey: 'key1', signedPreKey: 'spk1' } as never },
    }));
    await act(async () => {});
    expect(ref.current.deviceSignatureTrustIcon).toBeNull();
  });

  it('returns match icon when fingerprint matches', async () => {
    mockVerificationRecord = { verifiedDisplay: 'ABCDEF' };
    mockFingerprintDisplay = 'ABCDEF';
    const ref = renderHook(baseInput({
      senderDeviceId: 'dev-1',
      peerPublicKeysById: { 'sender-1': { identityKey: 'key1', signedPreKey: 'spk1' } as never },
    }));
    await act(async () => {});
    expect(ref.current.deviceSignatureTrustIcon).not.toBeNull();
  });

  it('returns mismatch icon and calls callback when fingerprint mismatches', async () => {
    mockVerificationRecord = { verifiedDisplay: 'ABCDEF' };
    mockFingerprintDisplay = 'GHIJKL';
    const onMismatch = mock(() => {});
    const ref = renderHook(baseInput({
      senderDeviceId: 'dev-1',
      peerPublicKeysById: { 'sender-1': { identityKey: 'key1', signedPreKey: 'spk1' } as never },
      onDeviceTrustMismatch: onMismatch,
    }));
    await act(async () => {});
    expect(ref.current.deviceSignatureTrustIcon).not.toBeNull();
    expect(onMismatch).toHaveBeenCalledWith('sender-1', 'dev-1');
  });

  it('returns null trust icon when message is deleted', async () => {
    mockVerificationRecord = { verifiedDisplay: 'ABCDEF' };
    mockFingerprintDisplay = 'ABCDEF';
    const ref = renderHook(baseInput({
      deleted: true,
      senderDeviceId: 'dev-1',
      peerPublicKeysById: { 'sender-1': { identityKey: 'key1', signedPreKey: 'spk1' } as never },
    }));
    await act(async () => {});
    expect(ref.current.deviceSignatureTrustIcon).toBeNull();
  });

  it('returns signature warning icon when signatureVerified is false', async () => {
    const ref = renderHook(baseInput({ signatureVerified: false }));
    await act(async () => {});
    expect(ref.current.signatureWarningIcon).not.toBeNull();
  });

  it('returns no signature warning icon when signatureVerified is true', async () => {
    const ref = renderHook(baseInput({ signatureVerified: true }));
    await act(async () => {});
    expect(ref.current.signatureWarningIcon).toBeNull();
  });

  it('returns no signature warning when message is deleted', async () => {
    const ref = renderHook(baseInput({ signatureVerified: false, deleted: true }));
    await act(async () => {});
    expect(ref.current.signatureWarningIcon).toBeNull();
  });

  it('returns fsDowngradeIcon when fsDowngraded is true', async () => {
    const ref = renderHook(baseInput({ fsDowngraded: true }));
    await act(async () => {});
    expect(ref.current.fsDowngradeIcon).not.toBeNull();
  });

  it('returns no fsDowngradeIcon when fsDowngraded is false', async () => {
    const ref = renderHook(baseInput({ fsDowngraded: false }));
    await act(async () => {});
    expect(ref.current.fsDowngradeIcon).toBeNull();
  });
});

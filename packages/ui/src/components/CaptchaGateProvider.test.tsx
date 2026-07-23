import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createElement, useEffect } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import * as configActual from '../config';
import { setMockTranslate } from '../test/react-i18next-mock';
import { clearCaptchaHandler, registerCaptchaHandler } from '@adieuu/shared';

let capturedOnComplete: ((response: string) => void) | null = null;

mock.module('./FriendlyCaptcha', () => ({
  FriendlyCaptcha: (props: { sitekey: string; onComplete: (r: string) => void }) => {
    capturedOnComplete = props.onComplete;
    return createElement('div', { 'data-testid': 'frc-widget' }, 'FRC Widget');
  },
}));

mock.module('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'authenticated',
    session: { captchaSitekey: 'test-sitekey' },
  }),
}));

mock.module('../config', () => ({
  ...configActual,
  useAppConfig: () => ({
    apiBaseUrl: 'http://localhost:3000',
    chatWsUrl: '',
    externalLinkBase: '',
    platform: 'web' as const,
    friendlyCaptchaSitekey: 'test-sitekey',
  }),
}));

setMockTranslate((key) => {
  const labels: Record<string, string> = {
    'captcha.gateTitle': 'Quick Verification',
    'captcha.gateDescription': 'Please complete this verification before continuing.',
    'captcha.gateCancel': 'Cancel',
    'captcha.gateSubmit': 'Continue',
  };
  return labels[key] ?? key;
});

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  CSS?: typeof CSS;
};

type CaptchaGateProviderComponent = typeof import('./CaptchaGateProvider').CaptchaGateProvider;
type UseCaptchaGateFn = typeof import('./CaptchaGateProvider').useCaptchaGate;

let happy: GlobalWindow;
let prevWindow: typeof globalThis.window;
let prevDocument: typeof globalThis.document;
let prevRaf: typeof globalThis.requestAnimationFrame;
let prevCancelRaf: typeof globalThis.cancelAnimationFrame;
let prevGcs: typeof globalThis.getComputedStyle;
let prevCss: typeof globalThis.CSS;
let CaptchaGateProvider: CaptchaGateProviderComponent;
let useCaptchaGate: UseCaptchaGateFn;

async function loadModule() {
  ({ CaptchaGateProvider, useCaptchaGate } = await import('./CaptchaGateProvider'));
}

beforeEach(async () => {
  capturedOnComplete = null;
  clearCaptchaHandler();
  await loadModule();

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
  clearCaptchaHandler();
});

function renderProvider() {
  const container = globalThis.document.createElement('div');
  globalThis.document.body.appendChild(container);
  const root = createRoot(container);

  let captchaGateRef: { requestCaptcha: () => Promise<string | null> } | null = null;

  function ChildThatGrabs() {
    const gate = useCaptchaGate();
    useEffect(() => {
      captchaGateRef = gate;
    });
    return null;
  }

  return {
    root,
    container,
    async mount() {
      await act(async () => {
        root.render(
          createElement(CaptchaGateProvider, null, createElement(ChildThatGrabs)),
        );
        await new Promise((r) => setTimeout(r, 0));
      });
    },
    getGate() {
      return captchaGateRef!;
    },
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('CaptchaGateProvider', () => {
  it('registers the captcha handler globally on mount', async () => {
    let handlerRegistered = false;
    const origRegister = registerCaptchaHandler;

    const harness = renderProvider();
    await harness.mount();

    const gate = harness.getGate();
    expect(gate).toBeDefined();
    expect(typeof gate.requestCaptcha).toBe('function');

    await harness.cleanup();
  });

  it('opens dialog when requestCaptcha is called and resolves with token on submit', async () => {
    const harness = renderProvider();
    await harness.mount();

    const gate = harness.getGate();

    let resolved: string | null | undefined;
    let captchaPromise: Promise<string | null>;

    await act(async () => {
      captchaPromise = gate.requestCaptcha();
      captchaPromise.then((v) => { resolved = v; });
      await new Promise((r) => setTimeout(r, 0));
    });

    const dialog = happy.document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(happy.document.body.textContent).toContain('Quick Verification');

    const continueBtn = [...happy.document.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('Continue'),
    );
    expect(continueBtn).toBeDefined();
    expect(continueBtn?.getAttribute('disabled')).not.toBeNull();

    expect(capturedOnComplete).not.toBeNull();
    await act(async () => {
      capturedOnComplete!('frc-token-xyz');
      await new Promise((r) => setTimeout(r, 0));
    });

    const continueBtnAfter = [...happy.document.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('Continue'),
    );
    expect(continueBtnAfter?.getAttribute('disabled')).toBeNull();

    await act(async () => {
      continueBtnAfter?.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(resolved).toBe('frc-token-xyz');

    await harness.cleanup();
  });

  it('resolves with null when user clicks Cancel', async () => {
    const harness = renderProvider();
    await harness.mount();

    const gate = harness.getGate();

    let resolved: string | null | undefined;

    await act(async () => {
      const p = gate.requestCaptcha();
      p.then((v) => { resolved = v; });
      await new Promise((r) => setTimeout(r, 0));
    });

    const dialog = happy.document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();

    const cancelBtn = [...happy.document.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('Cancel'),
    );
    expect(cancelBtn).toBeDefined();

    await act(async () => {
      cancelBtn?.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(resolved).toBeNull();

    await harness.cleanup();
  });

  it('resolves with null when no sitekey is available', async () => {
    mock.module('../config', () => ({
      ...configActual,
      useAppConfig: () => ({
        apiBaseUrl: 'http://localhost:3000',
        chatWsUrl: '',
        externalLinkBase: '',
        platform: 'web' as const,
        friendlyCaptchaSitekey: undefined,
      }),
    }));

    mock.module('../hooks/useAuth', () => ({
      useAuth: () => ({
        status: 'authenticated',
        session: {},
      }),
    }));

    const reloaded = await import('./CaptchaGateProvider');
    const ReloadedProvider = reloaded.CaptchaGateProvider;
    const reloadedUseCaptchaGate = reloaded.useCaptchaGate;

    const container = globalThis.document.createElement('div');
    globalThis.document.body.appendChild(container);
    const root = createRoot(container);

    let gate: { requestCaptcha: () => Promise<string | null> } | null = null;
    function Grab() {
      const g = reloadedUseCaptchaGate();
      useEffect(() => { gate = g; });
      return null;
    }

    await act(async () => {
      root.render(createElement(ReloadedProvider, null, createElement(Grab)));
      await new Promise((r) => setTimeout(r, 0));
    });

    const result = await gate!.requestCaptcha();
    expect(result).toBeNull();

    await act(async () => { root.unmount(); });
    container.remove();
  });
});

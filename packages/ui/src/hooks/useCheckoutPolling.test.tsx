import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { Window } from 'happy-dom';
import type { SubscriptionStatus } from '@adieuu/shared';
import { useCheckoutPolling, type UseCheckoutPollingRun } from './useCheckoutPolling';

const baseline: SubscriptionStatus = {
  activeSubscriptions: [],
  entitlements: [],
  isLifetime: false,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasStripeCustomer: false,
};

const updated: SubscriptionStatus = {
  ...baseline,
  activeSubscriptions: ['access'],
};

describe('useCheckoutPolling', () => {
  let win: Window;
  let root: Root | null = null;

  beforeAll(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    win = new Window();
    globalThis.window = win as unknown as Window & typeof globalThis;
    globalThis.document = win.document;
    globalThis.requestAnimationFrame = mock(() => 0);
    globalThis.cancelAnimationFrame = mock(() => {});
  });

  afterAll(() => {
    root?.unmount();
    delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).document;
  });

  test('completes when getStatus returns changed billing', async () => {
    let calls = 0;
    const api = {
      subscription: {
        getStatus: mock(async () => {
          calls += 1;
          if (calls === 1) {
            return { success: true as const, data: baseline };
          }
          return { success: true as const, data: updated };
        }),
      },
    };

    const container = document.createElement('div');
    let phaseSnap = 'idle';
    let cancelFn: (() => void) | null = null;

    function Host({ run }: { run: UseCheckoutPollingRun | null }) {
      const { phase, cancel } = useCheckoutPolling(api, run, {
        intervalMs: 10,
        maxDurationMs: 5000,
      });
      phaseSnap = phase;
      cancelFn = cancel;
      return null;
    }

    root = createRoot(container);

    await act(async () => {
      root!.render(<Host run={{ baseline }} />);
    });

    expect(phaseSnap).toBe('pending');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });

    expect(api.subscription.getStatus).toHaveBeenCalled();
    expect(phaseSnap).toBe('completed');

    await act(async () => {
      cancelFn?.();
      root?.unmount();
      root = null;
    });
  });

  test('cancel moves to cancelled while pending', async () => {
    const api = {
      subscription: {
        getStatus: mock(async () => ({ success: true as const, data: baseline })),
      },
    };

    const container = document.createElement('div');
    let phaseSnap = 'idle';
    let cancelFn: (() => void) | null = null;

    function Host({ run }: { run: UseCheckoutPollingRun | null }) {
      const { phase, cancel } = useCheckoutPolling(api, run, {
        intervalMs: 50,
        maxDurationMs: 10_000,
      });
      phaseSnap = phase;
      cancelFn = cancel;
      return null;
    }

    const localRoot = createRoot(container);
    await act(async () => {
      localRoot.render(<Host run={{ baseline }} />);
    });

    expect(phaseSnap).toBe('pending');

    await act(async () => {
      cancelFn?.();
    });

    expect(phaseSnap).toBe('cancelled');
    await act(async () => {
      localRoot.unmount();
    });
  });
});

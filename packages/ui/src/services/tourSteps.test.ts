import { describe, expect, test } from 'bun:test';
import { waitForElement } from './tourSteps';

describe('tourSteps', () => {
  test('waitForElement invokes callback when selector appears', async () => {
    let calls = 0;
    let present = false;
    Object.defineProperty(globalThis, 'document', {
      value: {
        querySelector: () => (present ? {} : null),
        body: { classList: { add: () => undefined, remove: () => undefined } },
      },
      configurable: true,
      writable: true,
    });
    const cleanup = waitForElement('[data-tour="x"]', () => {
      calls++;
    }, 5, 10);
    await new Promise((resolve) => setTimeout(resolve, 8));
    present = true;
    await new Promise((resolve) => setTimeout(resolve, 12));
    cleanup();
    expect(calls).toBe(1);
  });
});

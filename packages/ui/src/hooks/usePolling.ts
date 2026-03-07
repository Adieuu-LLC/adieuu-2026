/**
 * Polling utilities for periodic data refresh.
 *
 * Provides both a framework-agnostic controller (for testing) and a React hook
 * wrapper. The controller ensures at most one tick is in-flight at a time and
 * supports a caller-provided skip predicate (e.g. document hidden).
 */

import { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Pure controller (testable without React)
// ---------------------------------------------------------------------------

export interface PollingController {
  start: () => void;
  stop: () => void;
}

/**
 * Creates a polling controller that calls `tick` every `intervalMs`.
 *
 * - At most one `tick` runs concurrently (in-flight guard).
 * - If `shouldSkip` returns true the tick is silently skipped.
 * - `stop()` clears the interval; safe to call multiple times.
 * - `start()` is idempotent; calling it again is a no-op while running.
 */
export function createPollingController(
  tick: () => Promise<void>,
  intervalMs: number,
  shouldSkip?: () => boolean,
): PollingController {
  let timerId: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;

  const handler = async () => {
    if (inFlight) return;
    if (shouldSkip?.()) return;

    inFlight = true;
    try {
      await tick();
    } finally {
      inFlight = false;
    }
  };

  return {
    start() {
      if (timerId != null) return;
      timerId = setInterval(handler, intervalMs);
    },
    stop() {
      if (timerId != null) {
        clearInterval(timerId);
        timerId = null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * Periodically calls `tick` while mounted and `enabled` is true.
 *
 * Skips ticks when the document is hidden (Page Visibility API) and guards
 * against overlapping calls.
 *
 * @param tick      - Async function to run each interval.
 * @param interval  - Milliseconds between ticks. Pass 0 or undefined to disable.
 * @param enabled   - Master on/off switch (e.g. `isLoggedIn`).
 */
export function usePolling(
  tick: () => Promise<void>,
  interval: number | undefined,
  enabled: boolean,
): void {
  const controllerRef = useRef<PollingController | null>(null);

  useEffect(() => {
    if (!interval || !enabled) return;

    const ctrl = createPollingController(
      tick,
      interval,
      () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
    );

    controllerRef.current = ctrl;
    ctrl.start();

    return () => {
      ctrl.stop();
      controllerRef.current = null;
    };
  }, [tick, interval, enabled]);
}

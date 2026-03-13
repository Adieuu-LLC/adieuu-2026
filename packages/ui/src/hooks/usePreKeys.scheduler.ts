export const PREKEY_REPLENISH_DEBOUNCE_MS = 2000;
export const PREKEY_ROTATION_RETRY_MS = 5 * 60 * 1000;

type TimerHandle = ReturnType<typeof setTimeout>;
type SetTimer = (callback: () => void, delayMs: number) => TimerHandle;
type ClearTimer = (handle: TimerHandle) => void;

export function rescheduleTimer(
  current: TimerHandle | null,
  callback: () => void,
  delayMs: number,
  setTimer: SetTimer = setTimeout,
  clearTimer: ClearTimer = clearTimeout
): TimerHandle {
  if (current) {
    clearTimer(current);
  }
  return setTimer(callback, delayMs);
}

export interface DebouncedAsyncTrigger {
  trigger: () => boolean;
  cancel: () => void;
  isPending: () => boolean;
}

export function createDebouncedAsyncTrigger(
  run: () => Promise<void>,
  delayMs: number,
  setTimer: SetTimer = setTimeout,
  clearTimer: ClearTimer = clearTimeout
): DebouncedAsyncTrigger {
  let pending = false;
  let timer: TimerHandle | null = null;

  return {
    trigger: () => {
      if (pending) return false;
      pending = true;
      timer = setTimer(() => {
        pending = false;
        timer = null;
        void run();
      }, delayMs);
      return true;
    },
    cancel: () => {
      pending = false;
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
    },
    isPending: () => pending,
  };
}


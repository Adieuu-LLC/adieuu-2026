/**
 * Per-identity local preferences for E2EE message search (localStorage).
 *
 * @module hooks/useMessageSearchPreferences
 */

import { useCallback, useSyncExternalStore } from 'react';
import type {
  MessageSearchCacheMode,
  MessageSearchCacheRetention,
} from '../services/messageSearch/messageSearchCacheTypes';

const RETENTION_KEY_PREFIX = 'adieuu.message-search.retention.';
const MODE_KEY_PREFIX = 'adieuu.message-search.mode.';

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((f) => f());
}

const VALID_RETENTION = new Set<MessageSearchCacheRetention>([
  'wipe_immediately',
  'never',
  'after_1h',
  'after_1d',
  'after_7d',
  'after_30d',
]);
const DEFAULT_RETENTION: MessageSearchCacheRetention = 'wipe_immediately';

const VALID_MODE = new Set<MessageSearchCacheMode>(['on_demand', 'warm']);
const DEFAULT_MODE: MessageSearchCacheMode = 'on_demand';

export function loadMessageSearchRetention(identityId: string): MessageSearchCacheRetention {
  try {
    const raw = localStorage.getItem(RETENTION_KEY_PREFIX + identityId);
    if (raw && VALID_RETENTION.has(raw as MessageSearchCacheRetention)) {
      return raw as MessageSearchCacheRetention;
    }
  } catch {
    // ignore
  }
  return DEFAULT_RETENTION;
}

export function saveMessageSearchRetention(
  identityId: string,
  v: MessageSearchCacheRetention
): void {
  try {
    if (v === DEFAULT_RETENTION) {
      localStorage.removeItem(RETENTION_KEY_PREFIX + identityId);
    } else {
      localStorage.setItem(RETENTION_KEY_PREFIX + identityId, v);
    }
    emit();
  } catch {
    // ignore
  }
}

export function useMessageSearchRetention(
  identityId: string
): [MessageSearchCacheRetention, (v: MessageSearchCacheRetention) => void] {
  const snap = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => loadMessageSearchRetention(identityId),
    () => DEFAULT_RETENTION
  );
  const set = useCallback(
    (v: MessageSearchCacheRetention) => saveMessageSearchRetention(identityId, v),
    [identityId]
  );
  return [snap, set];
}

export function loadMessageSearchCacheMode(identityId: string): MessageSearchCacheMode {
  try {
    const raw = localStorage.getItem(MODE_KEY_PREFIX + identityId);
    if (raw && VALID_MODE.has(raw as MessageSearchCacheMode)) {
      return raw as MessageSearchCacheMode;
    }
  } catch {
    // ignore
  }
  return DEFAULT_MODE;
}

export function saveMessageSearchCacheMode(identityId: string, v: MessageSearchCacheMode): void {
  try {
    if (v === DEFAULT_MODE) {
      localStorage.removeItem(MODE_KEY_PREFIX + identityId);
    } else {
      localStorage.setItem(MODE_KEY_PREFIX + identityId, v);
    }
    emit();
  } catch {
    // ignore
  }
}

export function useMessageSearchCacheMode(
  identityId: string
): [MessageSearchCacheMode, (v: MessageSearchCacheMode) => void] {
  const snap = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => loadMessageSearchCacheMode(identityId),
    () => DEFAULT_MODE
  );
  const set = useCallback(
    (v: MessageSearchCacheMode) => saveMessageSearchCacheMode(identityId, v),
    [identityId]
  );
  return [snap, set];
}

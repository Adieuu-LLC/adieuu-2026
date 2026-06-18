/**
 * Client-side preference for composer toolbar controls (visibility, side, order).
 * Stored in localStorage; device-scoped like message layout prefs.
 */

import { useSyncExternalStore } from 'react';
import type {
  ComposerControlConfig,
  ComposerControlId,
  ComposerControlSide,
  ComposerSendIconId,
} from '../components/composer/composerTypes';

const STORAGE_KEY = 'adieuu.app.composerControls';

export const COMPOSER_SEND_ICON_OPTIONS: ComposerSendIconId[] = [
  'paper-plane',
  'mailbox',
  'arrow-right',
  'message-arrow-up',
  'message-arrow-up-right',
];

export const DEFAULT_COMPOSER_CONTROLS: ComposerControlConfig[] = [
  { id: 'forwardSecrecy', enabled: true, side: 'left', order: 0 },
  { id: 'timedMessage', enabled: true, side: 'left', order: 1 },
  { id: 'upload', enabled: true, side: 'right', order: 2 },
  { id: 'gif', enabled: true, side: 'right', order: 3 },
  { id: 'emoji', enabled: true, side: 'right', order: 4 },
  { id: 'send', enabled: false, side: 'right', order: 5, sendIcon: 'paper-plane', sendShowText: false },
];

const CONTROL_IDS: ComposerControlId[] = [
  'forwardSecrecy',
  'timedMessage',
  'upload',
  'gif',
  'emoji',
  'send',
];

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) {
    l();
  }
}

function isValidSide(value: unknown): value is ComposerControlSide {
  return value === 'left' || value === 'right';
}

function isValidSendIcon(value: unknown): value is ComposerSendIconId {
  return typeof value === 'string' && COMPOSER_SEND_ICON_OPTIONS.includes(value as ComposerSendIconId);
}

function normalizeControls(raw: unknown): ComposerControlConfig[] {
  if (!Array.isArray(raw)) return DEFAULT_COMPOSER_CONTROLS.map((c) => ({ ...c }));

  const byId = new Map<ComposerControlId, ComposerControlConfig>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as ComposerControlConfig).id;
    if (!CONTROL_IDS.includes(id)) continue;
    const side = isValidSide((item as ComposerControlConfig).side)
      ? (item as ComposerControlConfig).side
      : 'right';
    const order = typeof (item as ComposerControlConfig).order === 'number'
      ? (item as ComposerControlConfig).order
      : 0;
    const enabled = typeof (item as ComposerControlConfig).enabled === 'boolean'
      ? (item as ComposerControlConfig).enabled
      : true;
    const sendIcon = isValidSendIcon((item as ComposerControlConfig).sendIcon)
      ? (item as ComposerControlConfig).sendIcon
      : id === 'send'
        ? 'paper-plane'
        : undefined;
    const sendShowText =
      id === 'send' && typeof (item as ComposerControlConfig).sendShowText === 'boolean'
        ? (item as ComposerControlConfig).sendShowText
        : id === 'send'
          ? false
          : undefined;
    byId.set(id, {
      id,
      enabled,
      side,
      order,
      ...(sendIcon ? { sendIcon } : {}),
      ...(sendShowText !== undefined ? { sendShowText } : {}),
    });
  }

  const merged = CONTROL_IDS.map((id, index) => {
    const existing = byId.get(id);
    const fallback = DEFAULT_COMPOSER_CONTROLS.find((c) => c.id === id)!;
    return existing ?? { ...fallback, order: index };
  });

  return merged
    .sort((a, b) => a.order - b.order)
    .map((control, index) => ({ ...control, order: index }));
}

function readComposerControlsFromStorage(): ComposerControlConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COMPOSER_CONTROLS.map((c) => ({ ...c }));
    return normalizeControls(JSON.parse(raw));
  } catch {
    return DEFAULT_COMPOSER_CONTROLS.map((c) => ({ ...c }));
  }
}

/** Stable snapshot reference for useSyncExternalStore (must not change unless prefs change). */
let snapshot: ComposerControlConfig[] = readComposerControlsFromStorage();

function refreshSnapshot(): void {
  snapshot = readComposerControlsFromStorage();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    refreshSnapshot();
    emit();
  });
}

export function getComposerControls(): ComposerControlConfig[] {
  return snapshot;
}

export function saveComposerControls(controls: ComposerControlConfig[]): void {
  const normalized = normalizeControls(controls);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  snapshot = normalized;
  emit();
}

export function getComposerControlsBySide(
  controls: ComposerControlConfig[],
  side: ComposerControlSide,
): ComposerControlConfig[] {
  return controls.filter((c) => c.enabled && c.side === side);
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): ComposerControlConfig[] {
  return snapshot;
}

const serverSnapshot = DEFAULT_COMPOSER_CONTROLS.map((c) => ({ ...c }));

export function useComposerControlsPreference(): ComposerControlConfig[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}

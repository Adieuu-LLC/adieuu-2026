/**
 * Client-side preference for how per-member colours are displayed.
 * Three additive toggles (name / avatar accent / message border).
 * Stored in localStorage; mirrors the pattern used by message layout prefs.
 */

import { useSyncExternalStore } from 'react';

export interface MemberColorDisplay {
  name: boolean;
  avatarAccent: boolean;
  messageBorder: boolean;
}

const STORAGE_KEY = 'adieuu.app.memberColorDisplay';

export const DEFAULT_MEMBER_COLOR_DISPLAY: MemberColorDisplay = {
  name: true,
  avatarAccent: true,
  messageBorder: true,
};

const listeners = new Set<() => void>();

let cachedRaw: string | null | undefined;
let cachedValue: MemberColorDisplay = DEFAULT_MEMBER_COLOR_DISPLAY;

function emit(): void {
  for (const l of listeners) {
    l();
  }
}

function migrateLegacyMode(raw: string): MemberColorDisplay | null {
  if (raw === 'name-only') {
    return { name: true, avatarAccent: false, messageBorder: false };
  }
  if (raw === 'name-and-accent') {
    return { name: true, avatarAccent: true, messageBorder: false };
  }
  if (raw === 'name-and-bubble') {
    return { name: true, avatarAccent: false, messageBorder: true };
  }
  return null;
}

function parseStored(raw: string | null): MemberColorDisplay {
  if (raw == null) return DEFAULT_MEMBER_COLOR_DISPLAY;
  const legacy = migrateLegacyMode(raw);
  if (legacy) return legacy;
  try {
    const parsed = JSON.parse(raw) as Partial<MemberColorDisplay>;
    return {
      name:
        typeof parsed.name === 'boolean'
          ? parsed.name
          : DEFAULT_MEMBER_COLOR_DISPLAY.name,
      avatarAccent:
        typeof parsed.avatarAccent === 'boolean'
          ? parsed.avatarAccent
          : DEFAULT_MEMBER_COLOR_DISPLAY.avatarAccent,
      messageBorder:
        typeof parsed.messageBorder === 'boolean'
          ? parsed.messageBorder
          : DEFAULT_MEMBER_COLOR_DISPLAY.messageBorder,
    };
  } catch {
    return DEFAULT_MEMBER_COLOR_DISPLAY;
  }
}

export function getMemberColorDisplay(): MemberColorDisplay {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  cachedValue = parseStored(raw);
  return cachedValue;
}

export function setMemberColorDisplay(next: MemberColorDisplay): void {
  const normalized: MemberColorDisplay = {
    name: !!next.name,
    avatarAccent: !!next.avatarAccent,
    messageBorder: !!next.messageBorder,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  cachedRaw = JSON.stringify(normalized);
  cachedValue = normalized;
  emit();
}

export function patchMemberColorDisplay(patch: Partial<MemberColorDisplay>): void {
  setMemberColorDisplay({ ...getMemberColorDisplay(), ...patch });
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): MemberColorDisplay {
  return getMemberColorDisplay();
}

export function useMemberColorPreference(): MemberColorDisplay {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_MEMBER_COLOR_DISPLAY);
}

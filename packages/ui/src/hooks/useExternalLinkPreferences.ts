/**
 * Client-side preferences for external link interception.
 *
 * Stores a set of trusted domains (modal bypassed) and a global
 * "trust all links" flag in localStorage.  Follows the same
 * useSyncExternalStore pattern as useMessageLayoutPreference.
 *
 * @module hooks/useExternalLinkPreferences
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'adieuu.app.externalLinkPrefs';

interface ExternalLinkPrefs {
  trustedDomains: string[];
  trustAllLinks: boolean;
}

const DEFAULT_PREFS: ExternalLinkPrefs = {
  trustedDomains: [],
  trustAllLinks: false,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function readPrefs(): ExternalLinkPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ExternalLinkPrefs>;
    return {
      trustedDomains: Array.isArray(parsed.trustedDomains)
        ? parsed.trustedDomains.filter((d): d is string => typeof d === 'string')
        : [],
      trustAllLinks: typeof parsed.trustAllLinks === 'boolean' ? parsed.trustAllLinks : false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(prefs: ExternalLinkPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  emit();
}

export function getExternalLinkPrefs(): ExternalLinkPrefs {
  return readPrefs();
}

export function isDomainTrusted(domain: string): boolean {
  const prefs = readPrefs();
  if (prefs.trustAllLinks) return true;
  return prefs.trustedDomains.includes(domain.toLowerCase());
}

export function trustDomain(domain: string): void {
  const prefs = readPrefs();
  const lower = domain.toLowerCase();
  if (!prefs.trustedDomains.includes(lower)) {
    writePrefs({ ...prefs, trustedDomains: [...prefs.trustedDomains, lower] });
  }
}

export function untrustDomain(domain: string): void {
  const prefs = readPrefs();
  const lower = domain.toLowerCase();
  writePrefs({
    ...prefs,
    trustedDomains: prefs.trustedDomains.filter((d) => d !== lower),
  });
}

export function setTrustAllLinks(value: boolean): void {
  const prefs = readPrefs();
  writePrefs({ ...prefs, trustAllLinks: value });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): ExternalLinkPrefs {
  return readPrefs();
}

export function useExternalLinkPreferences(): ExternalLinkPrefs {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PREFS);
}

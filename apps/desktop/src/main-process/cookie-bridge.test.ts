import { describe, it, expect } from 'bun:test';
import {
  parseEnvCommaList,
  tokenToBridgePatterns,
  buildCookieBridgeUrlPatterns,
  shouldEnableCookieBridge,
} from './cookie-bridge';

describe('parseEnvCommaList', () => {
  it('returns empty for undefined or blank', () => {
    expect(parseEnvCommaList(undefined)).toEqual([]);
    expect(parseEnvCommaList('')).toEqual([]);
    expect(parseEnvCommaList('  ')).toEqual([]);
  });

  it('splits trims and drops empties', () => {
    expect(parseEnvCommaList(' a.com , b.com ')).toEqual(['a.com', 'b.com']);
  });
});

describe('tokenToBridgePatterns', () => {
  it('builds https and wss patterns for a host token', () => {
    expect(tokenToBridgePatterns('api.example.com')).toEqual([
      'https://api.example.com/*',
      'wss://api.example.com/*',
    ]);
  });

  it('returns empty for tokens with scheme or path', () => {
    expect(tokenToBridgePatterns('https://x.com')).toEqual([]);
    expect(tokenToBridgePatterns('host/path')).toEqual([]);
  });
});

describe('buildCookieBridgeUrlPatterns', () => {
  it('dedupes patterns', () => {
    const env = {
      ADIEUU_COOKIE_BRIDGE_HOSTS: 'api.adieuu.com,api.adieuu.com',
    };
    const p = buildCookieBridgeUrlPatterns(env);
    expect(p.filter((x) => x.includes('api.adieuu.com')).length).toBe(2);
    expect(new Set(p).size).toBe(p.length);
  });

  it('uses defaults plus extra when override not set', () => {
    const env = {
      ADIEUU_COOKIE_BRIDGE_EXTRA_HOSTS: 'extra.example.com',
    };
    const p = buildCookieBridgeUrlPatterns(env);
    expect(p.some((x) => x.includes('api.adieuu.com'))).toBe(true);
    expect(p.some((x) => x.includes('extra.example.com'))).toBe(true);
  });
});

describe('shouldEnableCookieBridge', () => {
  it('is always true when not dev', () => {
    expect(shouldEnableCookieBridge(false, {})).toBe(true);
    expect(shouldEnableCookieBridge(false, { ADIEUU_ENABLE_COOKIE_BRIDGE: 'false' })).toBe(true);
  });

  it('is opt-in in dev', () => {
    expect(shouldEnableCookieBridge(true, {})).toBe(false);
    expect(shouldEnableCookieBridge(true, { ADIEUU_ENABLE_COOKIE_BRIDGE: '1' })).toBe(true);
    expect(shouldEnableCookieBridge(true, { ADIEUU_ENABLE_COOKIE_BRIDGE: 'true' })).toBe(true);
    expect(shouldEnableCookieBridge(true, { ADIEUU_ENABLE_COOKIE_BRIDGE: 'yes' })).toBe(true);
  });
});

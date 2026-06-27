import { describe, it, expect } from 'bun:test';
import { extractDeepLinkPath } from './deep-link';

describe('extractDeepLinkPath', () => {
  it('returns pathname for custom scheme URLs', () => {
    expect(extractDeepLinkPath('adieuu://open/conversation/abc')).toBe('/conversation/abc');
  });

  it('returns slash for root path', () => {
    expect(extractDeepLinkPath('adieuu://app/')).toBe('/');
  });

  it('returns slash for malformed URLs', () => {
    expect(extractDeepLinkPath('not a url')).toBe('/');
  });
});

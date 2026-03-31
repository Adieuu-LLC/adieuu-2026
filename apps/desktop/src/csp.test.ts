import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Validates that the desktop app's Content Security Policy includes all
 * directives required by the shared UI package. Catches CSP regressions
 * before they reach a packaged build.
 */

let csp = '';

function parseDirectives(raw: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of raw.split(';')) {
    const tokens = part.trim().split(/\s+/);
    const name = tokens[0];
    if (!name) continue;
    directives.set(name, tokens.slice(1));
  }
  return directives;
}

beforeAll(() => {
  const html = readFileSync(
    resolve(__dirname, 'renderer/index.html'),
    'utf-8',
  );
  const match = html.match(
    /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/,
  );
  if (!match?.[1]) throw new Error('No CSP meta tag found in renderer/index.html');
  csp = match[1];
});

describe('desktop app CSP', () => {
  it('contains a CSP meta tag', () => {
    expect(csp).toBeDefined();
    expect(csp.length).toBeGreaterThan(0);
  });

  describe('script-src', () => {
    it("includes 'wasm-unsafe-eval' for WebAssembly (hash-wasm / Argon2)", () => {
      const directives = parseDirectives(csp);
      const scriptSrc = directives.get('script-src') ?? [];
      expect(scriptSrc).toContain("'wasm-unsafe-eval'");
    });

    it("does not include full 'unsafe-eval'", () => {
      const directives = parseDirectives(csp);
      const scriptSrc = directives.get('script-src') ?? [];
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    });
  });

  describe('img-src', () => {
    it("includes 'data:' for deterministic avatars", () => {
      const directives = parseDirectives(csp);
      const imgSrc = directives.get('img-src') ?? [];
      expect(imgSrc).toContain('data:');
    });

    it('does not reference external QR code services', () => {
      expect(csp).not.toContain('qrserver');
    });
  });

  describe('connect-src', () => {
    it('includes https://downloads.adieuu.com for release manifests', () => {
      const directives = parseDirectives(csp);
      const connectSrc = directives.get('connect-src') ?? [];
      expect(connectSrc).toContain('https://downloads.adieuu.com');
    });

    it('includes the API and WebSocket origins', () => {
      const directives = parseDirectives(csp);
      const connectSrc = directives.get('connect-src') ?? [];
      expect(connectSrc).toContain('https://api.adieuu.com');
      expect(connectSrc).toContain('wss://api.adieuu.com');
    });

    it('includes the S3 media bucket', () => {
      const directives = parseDirectives(csp);
      const connectSrc = directives.get('connect-src') ?? [];
      expect(connectSrc.some((v) => v.includes('s3.us-east-1.amazonaws.com'))).toBe(true);
    });

    it('includes localhost dev origins', () => {
      const directives = parseDirectives(csp);
      const connectSrc = directives.get('connect-src') ?? [];
      expect(connectSrc).toContain('http://localhost:4000');
      expect(connectSrc).toContain('ws://localhost:9001');
    });
  });

  describe('media-src', () => {
    it("includes 'self' and 'blob:' for notification sounds", () => {
      const directives = parseDirectives(csp);
      const mediaSrc = directives.get('media-src') ?? [];
      expect(mediaSrc).toContain("'self'");
      expect(mediaSrc).toContain('blob:');
    });
  });

  describe('style-src', () => {
    it('includes Google Fonts stylesheet origin', () => {
      const directives = parseDirectives(csp);
      const styleSrc = directives.get('style-src') ?? [];
      expect(styleSrc).toContain('https://fonts.googleapis.com');
    });
  });

  describe('font-src', () => {
    it('includes Google Fonts file origin', () => {
      const directives = parseDirectives(csp);
      const fontSrc = directives.get('font-src') ?? [];
      expect(fontSrc).toContain('https://fonts.gstatic.com');
    });
  });

  describe('frame-safety', () => {
    it("has default-src 'self' as a baseline", () => {
      const directives = parseDirectives(csp);
      const defaultSrc = directives.get('default-src') ?? [];
      expect(defaultSrc).toContain("'self'");
    });
  });
});

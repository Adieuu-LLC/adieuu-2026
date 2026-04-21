import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cspManifest } from './csp';
import { serializeCsp } from '../../../packages/shared/src/csp/serialize';
import { mergeCspManifests } from '../../../packages/shared/src/csp/merge';

/**
 * Validates that the web app's Content Security Policy includes all directives
 * required by the shared UI package and that production builds never ship
 * 'unsafe-inline' in script-src. Catches CSP regressions before they reach
 * a deployed build.
 */

let csp = '';
let htmlInlineScriptHashes: string[] = [];

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
  const html = readFileSync(resolve(__dirname, '../index.html'), 'utf-8');

  const inlineRe = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = inlineRe.exec(html)) !== null) {
    const content = match[1] ?? '';
    if (content.trim()) {
      const hash = createHash('sha256').update(content, 'utf-8').digest('base64');
      htmlInlineScriptHashes.push(`'sha256-${hash}'`);
    }
  }

  const merged = mergeCspManifests(
    cspManifest,
    htmlInlineScriptHashes.length > 0
      ? { 'script-src': htmlInlineScriptHashes }
      : {},
  );
  csp = serializeCsp(merged);
});

describe('web app CSP', () => {
  it('produces a non-empty policy string', () => {
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

    it("does not include 'unsafe-inline' in production", () => {
      const directives = parseDirectives(csp);
      const scriptSrc = directives.get('script-src') ?? [];
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    });

    it('includes a SHA-256 hash for the inline theme hydration script', () => {
      expect(htmlInlineScriptHashes.length).toBeGreaterThan(0);
      const directives = parseDirectives(csp);
      const scriptSrc = directives.get('script-src') ?? [];
      for (const hash of htmlInlineScriptHashes) {
        expect(scriptSrc).toContain(hash);
      }
    });

    it('includes unpkg for ffmpeg.wasm core (video transcoding)', () => {
      const directives = parseDirectives(csp);
      const scriptSrc = directives.get('script-src') ?? [];
      expect(scriptSrc).toContain('https://unpkg.com');
    });
  });

  describe('worker-src', () => {
    it("includes blob: for ffmpeg web workers", () => {
      const directives = parseDirectives(csp);
      const workerSrc = directives.get('worker-src') ?? [];
      expect(workerSrc).toContain('blob:');
    });
  });

  describe('img-src', () => {
    it("includes 'data:' for deterministic avatars", () => {
      const directives = parseDirectives(csp);
      const imgSrc = directives.get('img-src') ?? [];
      expect(imgSrc).toContain('data:');
    });

    it('includes the E2E media S3 bucket for conversation images', () => {
      const directives = parseDirectives(csp);
      const imgSrc = directives.get('img-src') ?? [];
      expect(imgSrc.some((v) => v.includes('e2e-media') && v.includes('s3.'))).toBe(true);
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

    it('includes the E2E media S3 bucket', () => {
      const directives = parseDirectives(csp);
      const connectSrc = directives.get('connect-src') ?? [];
      expect(connectSrc.some((v) => v.includes('e2e-media') && v.includes('s3.'))).toBe(true);
    });

    it('includes unpkg for ffmpeg-core.wasm fetch', () => {
      const directives = parseDirectives(csp);
      const connectSrc = directives.get('connect-src') ?? [];
      expect(connectSrc).toContain('https://unpkg.com');
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
    it('does not reference external font services', () => {
      const directives = parseDirectives(csp);
      const styleSrc = directives.get('style-src') ?? [];
      expect(styleSrc).not.toContain('https://fonts.googleapis.com');
    });
  });

  describe('font-src', () => {
    it('serves fonts from self only', () => {
      const directives = parseDirectives(csp);
      const fontSrc = directives.get('font-src') ?? [];
      expect(fontSrc).toContain("'self'");
      expect(fontSrc).not.toContain('https://fonts.gstatic.com');
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

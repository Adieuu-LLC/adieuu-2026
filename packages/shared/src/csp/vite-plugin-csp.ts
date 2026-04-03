/**
 * Vite plugin that generates a Content Security Policy at build time.
 *
 * - Finds inline `<script>` blocks (those without a `src` attribute) and
 *   computes their SHA-256 hashes.
 * - Merges all supplied CSP manifests into a single directive set.
 * - Injects the resulting policy into the `<meta http-equiv="Content-Security-Policy">`
 *   tag via Vite's `transformIndexHtml` hook.
 * - In development mode, adds `'unsafe-inline'` to `script-src` so that
 *   Vite's HMR preamble and React Fast Refresh injections work.
 *
 * This file is imported directly by Vite configs (not via the package
 * barrel export) and uses structural typing to avoid a build-time
 * dependency on the `vite` package in `@adieuu/shared`.
 *
 * @module csp/vite-plugin-csp
 */

import { createHash } from 'node:crypto';
import { mergeCspManifests } from './merge';
import { serializeCsp } from './serialize';
import type { CspDirectives } from './types';

export interface CspPluginOptions {
  /** One or more CSP manifest objects to merge. */
  manifests: CspDirectives[];

  /**
   * Extra directives merged in only during development
   * (e.g. localhost API / WebSocket origins).
   */
  devExtras?: CspDirectives;
}

const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;

const CSP_META_RE =
  /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/i;

function sha256Base64(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('base64');
}

/**
 * Create the Vite plugin.
 *
 * Returns a plain object compatible with Vite's `Plugin` interface
 * (structural typing; no import from `vite` needed).
 */
export function cspPlugin(options: CspPluginOptions) {
  return {
    name: 'adieuu-csp',
    transformIndexHtml(html: string, ctx: { server?: unknown }) {
      const isDev = !!ctx.server;

      const hashes: string[] = [];
      let match: RegExpExecArray | null;
      const re = new RegExp(INLINE_SCRIPT_RE.source, INLINE_SCRIPT_RE.flags);
      while ((match = re.exec(html)) !== null) {
        const scriptContent = match[1] ?? '';
        if (scriptContent.trim()) {
          hashes.push(`'sha256-${sha256Base64(scriptContent)}'`);
        }
      }

      const hashDirectives: CspDirectives =
        hashes.length > 0 ? { 'script-src': hashes } : {};

      const devDirectives: CspDirectives = isDev
        ? mergeCspManifests(
            { 'script-src': ["'unsafe-inline'"] },
            options.devExtras ?? {},
          )
        : {};

      const merged = mergeCspManifests(
        ...options.manifests,
        hashDirectives,
        devDirectives,
      );

      const cspString = serializeCsp(merged);

      return html.replace(CSP_META_RE, `$1${cspString}$3`);
    },
  };
}

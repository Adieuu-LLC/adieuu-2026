/**
 * Deterministic colour checksum for theme deduplication.
 *
 * Produces a hex SHA-256 digest of the colour tokens only (name,
 * description, author, etc. are deliberately excluded). Keys are
 * serialised in THEME_TOKEN_KEYS order so the result is stable
 * regardless of the object's original key ordering.
 *
 * Uses the Web Crypto API (available in browsers and Bun).
 *
 * @module utils/themeChecksum
 */

import { THEME_TOKEN_KEYS, type ThemeColorTokens } from '../types/theme';

/**
 * Build a canonical JSON string from colour tokens.
 * Keys are emitted in THEME_TOKEN_KEYS order; values are
 * lowercased and trimmed to collapse trivial formatting differences.
 */
export function canonicalColorString(colors: ThemeColorTokens): string {
  const ordered: Record<string, string> = {};
  for (const key of THEME_TOKEN_KEYS) {
    ordered[key] = (colors[key] ?? '').trim().toLowerCase();
  }
  return JSON.stringify(ordered);
}

/**
 * Compute a hex SHA-256 checksum of a theme's colour tokens.
 */
export async function computeColorChecksum(colors: ThemeColorTokens): Promise<string> {
  const data = new TextEncoder().encode(canonicalColorString(colors));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Serialises a {@link CspDirectives} object into a CSP policy string
 * suitable for a `<meta http-equiv="Content-Security-Policy">` tag.
 *
 * @module csp/serialize
 */

import type { CspDirectives } from './types';

/**
 * Canonical ordering for CSP directives.
 *
 * `default-src` always comes first; remaining directives are sorted
 * alphabetically so the output is stable across builds.
 */
function sortDirectiveKeys(keys: string[]): string[] {
  return keys.sort((a, b) => {
    if (a === 'default-src') return -1;
    if (b === 'default-src') return 1;
    return a.localeCompare(b);
  });
}

/**
 * Produce a policy string from structured directives.
 *
 * @example
 * ```ts
 * serializeCsp({ 'default-src': ["'self'"], 'script-src': ["'self'", "'sha256-abc'"] })
 * // "default-src 'self'; script-src 'self' 'sha256-abc'"
 * ```
 */
export function serializeCsp(directives: CspDirectives): string {
  const keys = sortDirectiveKeys(Object.keys(directives));

  return keys
    .map((key) => `${key} ${directives[key]!.join(' ')}`)
    .join('; ');
}

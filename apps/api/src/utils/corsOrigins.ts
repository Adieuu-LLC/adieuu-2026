/**
 * CORS origin parsing and matching.
 *
 * Supports:
 * - Exact origins: `https://app.example.com`
 * - Single `*` (any origin; use without credentials in production)
 * - One `*` wildcard in the host: `https://*.example.com` matches `https://app.example.com`,
 *   `https://staging.app.example.com`, etc. (self-hosted / preview subdomains)
 *
 * Browsers require a concrete `Access-Control-Allow-Origin` value; patterns are evaluated
 * server-side and the request's `Origin` is echoed when it matches.
 */

/**
 * Split a comma-separated CORS_ORIGINS string into entries (trimmed, non-empty).
 */
export function parseCorsOriginsList(raw: string): string[] {
  if (raw === '*') return ['*'];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * True if any entry uses a pattern or wildcard (affects `Vary: Origin` caching).
 */
export function corsOriginsNeedVaryHeader(entries: string[]): boolean {
  return entries.length > 1 || entries.includes('*') || entries.some((e) => e.includes('*'));
}

/**
 * Whether `origin` satisfies a single allow-list entry (exact or `https://*.domain` style).
 */
export function originMatchesEntry(origin: string, entry: string): boolean {
  if (entry === '*') return true;
  if (!entry.includes('*')) return origin === entry;
  const parts = entry.split('*');
  if (parts.length !== 2) return false;
  const prefix = parts[0]!;
  const suffix = parts[1]!;
  if (!origin.startsWith(prefix) || !origin.endsWith(suffix)) return false;
  const middle = origin.slice(prefix.length, origin.length - suffix.length);
  if (middle.length === 0) return false;
  // Host segment only (no path, no port in pattern — use exact origin for ports)
  if (middle.includes('/') || middle.includes(':')) return false;
  return true;
}

/**
 * Resolves which origin to reflect in `Access-Control-Allow-Origin`, or null if disallowed.
 * When `requestOrigin` is missing (non-browser clients), returns the first allowed entry if any.
 */
export function resolveCorsAllowedOrigin(
  requestOrigin: string | null,
  allowedEntries: string[],
): string | null {
  if (allowedEntries.includes('*')) {
    return requestOrigin ?? '*';
  }
  if (!requestOrigin) {
    return allowedEntries[0] ?? null;
  }
  for (const entry of allowedEntries) {
    if (originMatchesEntry(requestOrigin, entry)) {
      return requestOrigin;
    }
  }
  return null;
}

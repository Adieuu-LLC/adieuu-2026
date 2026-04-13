/**
 * Extracts the SPA route path from a deep link URL.
 *
 * Example: adieuu://open/conversation/abc123 -> /conversation/abc123
 */
export function extractDeepLinkPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname || '/';
  } catch {
    return '/';
  }
}

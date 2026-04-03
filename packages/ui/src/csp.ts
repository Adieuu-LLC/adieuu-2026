/**
 * CSP requirements for @adieuu/ui.
 *
 * - `style-src 'unsafe-inline'`: FontAwesome SVG core, recharts, and
 *    emoji-mart inject `<style>` elements at runtime. None of these
 *    libraries support CSP nonce passthrough, so `'unsafe-inline'` is
 *    required until upstream support lands.
 * - `img-src data:`: Deterministic SVG avatars are rendered as data URIs.
 * - `img-src blob:` / `media-src blob:`: Object URLs for image previews,
 *    avatar uploads, and notification sound playback.
 *
 * @module ui/csp
 */

export const uiCspManifest: Record<string, string[]> = {
  'style-src': ["'unsafe-inline'"],
  'img-src': ['data:', 'blob:'],
  'media-src': ['blob:'],
};

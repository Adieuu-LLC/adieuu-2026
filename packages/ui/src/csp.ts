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
 * - `script-src https://unpkg.com` + `wasm-unsafe-eval`: optional ffmpeg.wasm (video→MP4 in browser).
 * - `worker-src blob:`: ffmpeg web workers.
 * - `connect-src https://unpkg.com`: fetch of `ffmpeg-core.wasm` from CDN.
 *
 * @module ui/csp
 */

export const uiCspManifest: Record<string, string[]> = {
  'style-src': ["'unsafe-inline'"],
  'img-src': ['data:', 'blob:'],
  'media-src': ['blob:'],
  'script-src': ['https://unpkg.com', "'wasm-unsafe-eval'"],
  'worker-src': ['blob:'],
  'connect-src': ['https://unpkg.com'],
};

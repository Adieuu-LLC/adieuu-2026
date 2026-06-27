/**
 * Parses a CSS colour string to comma-separated `R, G, B` values (0–255) for
 * APIs that only accept triplets (e.g. emoji-mart `--rgb-background` on the host).
 *
 * Browser-only: uses computed style resolution so hex, rgb(), hsl(), oklch(), etc.
 * match the engine’s interpretation of the theme token.
 */
export function cssColorToRgbTriplet(cssColor: string): string | null {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;color:${cssColor}`;
  document.documentElement.appendChild(el);
  const rgb = getComputedStyle(el).color;
  document.documentElement.removeChild(el);
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) return null;
  return `${m[1]}, ${m[2]}, ${m[3]}`;
}

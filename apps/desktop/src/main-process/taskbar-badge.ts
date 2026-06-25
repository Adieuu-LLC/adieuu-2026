import type { NativeImage } from 'electron';
import { nativeImage } from 'electron';
import { parseHexRgb } from './badge-color';

// Default accent colour (#22d3ee) used when the renderer hasn't sent one yet.
let badgeR = 0x22;
let badgeG = 0xd3;
let badgeB = 0xee;

// Secondary accent colour for tray dot (defaults to a warm orange).
let dotR = 0xf9;
let dotG = 0x73;
let dotB = 0x16;

/**
 * Parses a CSS hex colour string (e.g. "#ff00aa") into RGB components and
 * stores them for badge rendering.  Returns true if the colour changed.
 */
export function applyBadgeColor(hex: string): boolean {
  const rgb = parseHexRgb(hex);
  if (!rgb) return false;
  if (badgeR === rgb.r && badgeG === rgb.g && badgeB === rgb.b) return false;
  badgeR = rgb.r;
  badgeG = rgb.g;
  badgeB = rgb.b;
  return true;
}

/**
 * Stores the secondary accent colour used for the tray unread dot.
 * Returns true if the colour changed.
 */
export function applyDotColor(hex: string): boolean {
  const rgb = parseHexRgb(hex);
  if (!rgb) return false;
  if (dotR === rgb.r && dotG === rgb.g && dotB === rgb.b) return false;
  dotR = rgb.r;
  dotG = rgb.g;
  dotB = rgb.b;
  return true;
}

// 5x7 bitmap glyphs for digits 0-9 and '+'. Each glyph is a flat array of
// 5*7 = 35 values (0 or 1), stored row-major.
const GLYPH_W = 5;
const GLYPH_H = 7;
const GLYPHS: Record<string, readonly number[]> = {
  '0': [0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0],
  '1': [0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0],
  '2': [0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1],
  '3': [0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0],
  '4': [0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
  '5': [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0],
  '6': [0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0],
  '7': [1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
  '8': [0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0],
  '9': [0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0],
  '+': [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
};

let cachedBasePng: Buffer | null = null;
let cachedBaseSize: { width: number; height: number } | null = null;

function loadBasePng(iconPath: string): Buffer | null {
  if (cachedBasePng) return cachedBasePng;
  try {
    const img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) return null;
    cachedBaseSize = img.getSize();
    cachedBasePng = img.toPNG();
    return cachedBasePng;
  } catch {
    return null;
  }
}

export function getBaseIcon(iconPath: string): NativeImage | null {
  const png = loadBasePng(iconPath);
  if (!png) return null;
  return nativeImage.createFromBuffer(png);
}

/**
 * Renders a filled circle onto a BGRA bitmap buffer.  Uses basic distance-
 * field anti-aliasing (1 px fringe) for smooth edges.
 */
function fillCircle(
  buf: Buffer,
  w: number,
  cx: number,
  cy: number,
  r: number,
  cr: number,
  cg: number,
  cb: number,
  ca: number,
): void {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(Math.floor(buf.length / (w * 4)) - 1, Math.ceil(cy + r + 1));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist > r + 0.5) continue;
      const alpha = dist > r - 0.5 ? (r + 0.5 - dist) * ca : ca;
      if (alpha <= 0) continue;

      const off = (y * w + x) * 4;
      const srcA = alpha / 255;
      const dstA = buf[off + 3]! / 255;
      const outA = srcA + dstA * (1 - srcA);
      if (outA > 0) {
        buf[off + 0] = Math.round((cb * srcA + buf[off + 0]! * dstA * (1 - srcA)) / outA);
        buf[off + 1] = Math.round((cg * srcA + buf[off + 1]! * dstA * (1 - srcA)) / outA);
        buf[off + 2] = Math.round((cr * srcA + buf[off + 2]! * dstA * (1 - srcA)) / outA);
        buf[off + 3] = Math.round(outA * 255);
      }
    }
  }
}

function drawGlyph(
  buf: Buffer,
  w: number,
  h: number,
  glyph: readonly number[],
  gx: number,
  gy: number,
  scale: number,
  cr: number,
  cg: number,
  cb: number,
): void {
  for (let row = 0; row < GLYPH_H; row++) {
    for (let col = 0; col < GLYPH_W; col++) {
      if (!glyph[row * GLYPH_W + col]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = gx + col * scale + dx;
          const py = gy + row * scale + dy;
          if (px < 0 || px >= w || py < 0 || py >= h) continue;
          const off = (py * w + px) * 4;
          buf[off + 0] = cb;
          buf[off + 1] = cg;
          buf[off + 2] = cr;
          buf[off + 3] = 255;
        }
      }
    }
  }
}

/**
 * Returns a copy of the base icon with a filled dot in the bottom-right
 * corner, using the secondary accent colour.  Used for tray unread indicators
 * where a count is unnecessary.
 */
export function createDotBadgedIcon(iconPath: string): NativeImage | null {
  const png = loadBasePng(iconPath);
  if (!png || !cachedBaseSize) return null;

  const fresh = nativeImage.createFromBuffer(png);
  const { width: w, height: h } = cachedBaseSize;
  const buf = Buffer.from(fresh.toBitmap());

  const radius = Math.max(3, Math.round(w * 0.19));
  const margin = Math.round(w * 0.06);
  const cx = w - margin - radius;
  const cy = h - margin - radius;

  fillCircle(buf, w, cx, cy, radius, dotR, dotG, dotB, 255);

  return nativeImage.createFromBitmap(buf, { width: w, height: h });
}

/**
 * Returns a copy of the base icon with all semi/fully opaque pixels recolored
 * to the current accent colour, preserving alpha.  Used for tray icons that
 * should follow the user's theme.
 */
export function createTintedIcon(iconPath: string): NativeImage | null {
  const png = loadBasePng(iconPath);
  if (!png || !cachedBaseSize) return null;

  const fresh = nativeImage.createFromBuffer(png);
  const { width: w, height: h } = cachedBaseSize;
  const buf = Buffer.from(fresh.toBitmap());

  for (let i = 0; i < buf.length; i += 4) {
    const a = buf[i + 3]!;
    if (a === 0) continue;
    buf[i + 0] = badgeB;
    buf[i + 1] = badgeG;
    buf[i + 2] = badgeR;
  }

  return nativeImage.createFromBitmap(buf, { width: w, height: h });
}

/**
 * Returns a tinted copy of the base icon with an unread dot overlaid.
 */
export function createTintedDotIcon(iconPath: string): NativeImage | null {
  const png = loadBasePng(iconPath);
  if (!png || !cachedBaseSize) return null;

  const fresh = nativeImage.createFromBuffer(png);
  const { width: w, height: h } = cachedBaseSize;
  const buf = Buffer.from(fresh.toBitmap());

  for (let i = 0; i < buf.length; i += 4) {
    const a = buf[i + 3]!;
    if (a === 0) continue;
    buf[i + 0] = badgeB;
    buf[i + 1] = badgeG;
    buf[i + 2] = badgeR;
  }

  const radius = Math.max(3, Math.round(w * 0.19));
  const margin = Math.round(w * 0.06);
  const cx = w - margin - radius;
  const cy = h - margin - radius;

  fillCircle(buf, w, cx, cy, radius, dotR, dotG, dotB, 255);

  return nativeImage.createFromBitmap(buf, { width: w, height: h });
}

/**
 * Returns a copy of the base icon with a badge pill rendered in the bottom-
 * right corner.  If `count` is 0 the original icon is returned unchanged.
 */
export function createBadgedIcon(iconPath: string, count: number): NativeImage | null {
  if (count <= 0) return getBaseIcon(iconPath);

  const png = loadBasePng(iconPath);
  if (!png || !cachedBaseSize) return null;

  const fresh = nativeImage.createFromBuffer(png);
  const { width: w, height: h } = cachedBaseSize;
  const buf = Buffer.from(fresh.toBitmap());

  const label = count > 99 ? '99+' : String(count);
  const chars = label.split('');

  const scale = Math.max(1, Math.round(w * 0.045));
  const charW = GLYPH_W * scale;
  const charH = GLYPH_H * scale;
  const gap = Math.max(1, Math.round(scale * 0.6));
  const textW = chars.length * charW + (chars.length - 1) * gap;
  const paddingX = Math.round(scale * 2.5);
  const paddingY = Math.round(scale * 1.8);

  const pillW = textW + paddingX * 2;
  const pillH = charH + paddingY * 2;
  const pillR = pillH / 2;
  const margin = Math.round(w * 0.04);

  const pillCenterX = w - margin - pillW / 2;
  const pillCenterY = h - margin - pillH / 2;

  const leftCx = pillCenterX - pillW / 2 + pillR;
  const rightCx = pillCenterX + pillW / 2 - pillR;

  fillCircle(buf, w, leftCx, pillCenterY, pillR, badgeR, badgeG, badgeB, 255);
  fillCircle(buf, w, rightCx, pillCenterY, pillR, badgeR, badgeG, badgeB, 255);

  const rectX0 = Math.floor(leftCx);
  const rectX1 = Math.ceil(rightCx);
  const rectY0 = Math.max(0, Math.round(pillCenterY - pillR));
  const rectY1 = Math.min(h - 1, Math.round(pillCenterY + pillR));
  for (let y = rectY0; y <= rectY1; y++) {
    for (let x = rectX0; x <= rectX1; x++) {
      const off = (y * w + x) * 4;
      buf[off + 0] = badgeB;
      buf[off + 1] = badgeG;
      buf[off + 2] = badgeR;
      buf[off + 3] = 255;
    }
  }

  const textX = Math.round(pillCenterX - textW / 2);
  const textY = Math.round(pillCenterY - charH / 2);
  for (let i = 0; i < chars.length; i++) {
    const glyph = GLYPHS[chars[i]!];
    if (!glyph) continue;
    drawGlyph(buf, w, h, glyph, textX + i * (charW + gap), textY, scale, 255, 255, 255);
  }

  return nativeImage.createFromBitmap(buf, { width: w, height: h });
}

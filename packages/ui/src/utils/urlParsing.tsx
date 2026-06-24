/**
 * URL detection and rendering for message text.
 *
 * Splits plain-text message content into segments of literal text and
 * clickable URL spans.  Runs *before* any emoji processing on the
 * display side so that protocol schemes (`://`) are not clobbered by
 * text-shortcut replacement.
 *
 * @module utils/urlParsing
 */

import type { ReactNode } from 'react';

/**
 * Matches http(s) URLs and bare `www.` domains.
 *
 * Kept intentionally conservative — no exotic protocols (security), and
 * trailing punctuation that is almost always sentence-level (`.`, `,`,
 * `)`, `!`, `?`) is excluded via a negative lookbehind-style trim.
 */
const URL_RE =
  /(?:https?:\/\/|www\.)[^\s<>'"]+/gi;

/** Characters that are typically sentence punctuation, not part of the URL. */
const TRAILING_PUNCT = /[.,;:!?)]+$/;

/**
 * Parameters commonly used for cross-site tracking / attribution.
 * Stripping these gives users a cleaner, more private link.
 */
export const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'twclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'yclid',
  '_ga',
  '_gl',
  '__hssc',
  '__hstc',
  '__hsfp',
  'hsCtaTracking',
  'ref',
  'ref_src',
  'ref_url',
]);

export interface UrlSegment {
  type: 'url';
  raw: string;
  href: string;
}

export interface TextSegment {
  type: 'text';
  value: string;
}

export type MessageSegment = UrlSegment | TextSegment;

/**
 * Normalise a matched URL string into a full `href`.
 * Bare `www.` domains get `https://` prepended.
 */
function normaliseHref(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

/**
 * Split a plain-text message into text and URL segments.
 */
export function parseMessageSegments(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    let raw = match[0];
    const start = match.index ?? 0;

    // Trim trailing sentence punctuation that is almost certainly not
    // part of the URL (e.g. "Check https://example.com." — the period
    // belongs to the sentence).
    const trimmed = raw.replace(TRAILING_PUNCT, '');
    if (trimmed.length > 0) raw = trimmed;

    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }

    segments.push({ type: 'url', raw, href: normaliseHref(raw) });
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * Detect whether a URL contains known tracking query parameters.
 */
export function detectTrackingParams(href: string): string[] {
  try {
    const url = new URL(href);
    const found: string[] = [];
    for (const key of url.searchParams.keys()) {
      if (TRACKING_PARAMS.has(key)) found.push(key);
    }
    return found;
  } catch {
    return [];
  }
}

/**
 * Return a copy of the URL with all known tracking parameters stripped.
 */
export function stripTrackingParams(href: string): string {
  try {
    const url = new URL(href);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return href;
  }
}

/**
 * Extract the hostname from a URL string, returning `null` on failure.
 */
export function extractDomain(href: string): string | null {
  try {
    return new URL(href).hostname;
  } catch {
    return null;
  }
}

/**
 * Render message text with URL segments as clickable styled spans.
 *
 * Each URL span receives the `dm-link` class and calls `onLinkClick`
 * instead of navigating directly, so the external-link modal can
 * intercept.
 */
export function renderMessageWithUrls(
  text: string,
  onLinkClick: (href: string) => void,
): ReactNode[] {
  const segments = parseMessageSegments(text);

  if (segments.length === 1 && segments[0]?.type === 'text') {
    return [text];
  }

  return segments.map((seg, i) => {
    if (seg.type === 'text') return seg.value;
    return (
      // biome-ignore lint/a11y/useSemanticElements: SPA-style link handler without a real href
      <span
        key={i}
        className="dm-link"
        role="link"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          onLinkClick(seg.href);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onLinkClick(seg.href);
          }
        }}
      >
        {seg.raw}
      </span>
    );
  });
}

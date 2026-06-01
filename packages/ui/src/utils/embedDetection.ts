/**
 * Embed detection utilities.
 *
 * Identifies URLs in message text that can be rendered as rich embeds
 * (YouTube videos, generic link cards, etc.).
 *
 * @module utils/embedDetection
 */

import { parseMessageSegments, type UrlSegment } from './urlParsing';

export type EmbedType = 'youtube' | 'generic';

export interface EmbedInfo {
  type: EmbedType;
  url: string;
  /** YouTube video ID (only for type 'youtube') */
  videoId?: string;
}

const YOUTUBE_PATTERNS = [
  /(?:youtube\.com|youtube-nocookie\.com)\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com|youtube-nocookie\.com)\/shorts\/([a-zA-Z0-9_-]{11})/,
  /youtu\.be\/([a-zA-Z0-9_-]{11})/,
];

/**
 * Try to extract a YouTube video ID from a URL.
 */
export function extractYouTubeVideoId(url: string): string | null {
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Classify a single URL into an embed type.
 */
export function classifyUrl(url: string): EmbedInfo | null {
  const videoId = extractYouTubeVideoId(url);
  if (videoId) {
    return { type: 'youtube', url, videoId };
  }
  // Any http(s) URL can potentially be a generic link embed
  if (/^https?:\/\//i.test(url)) {
    return { type: 'generic', url };
  }
  return null;
}

/**
 * Extract all embeddable URLs from message text.
 * Returns deduplicated embed info in order of appearance.
 */
export function detectEmbeds(text: string): EmbedInfo[] {
  const segments = parseMessageSegments(text);
  const urls = segments.filter((s): s is UrlSegment => s.type === 'url');
  const seen = new Set<string>();
  const embeds: EmbedInfo[] = [];

  for (const seg of urls) {
    if (seen.has(seg.href)) continue;
    seen.add(seg.href);

    const embed = classifyUrl(seg.href);
    if (embed) embeds.push(embed);
  }

  return embeds;
}

/**
 * Returns true if the message text contains only a URL (possibly with
 * whitespace), indicating the embed should be displayed in "hero" mode.
 */
export function isUrlOnlyMessage(text: string): boolean {
  const trimmed = text.trim();
  const segments = parseMessageSegments(trimmed);
  return (
    segments.length === 1 &&
    segments[0]?.type === 'url'
  );
}

/**
 * Extract the TLD (effective domain) from a URL for allowlist matching.
 * Returns the hostname without `www.` prefix.
 */
export function extractTld(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

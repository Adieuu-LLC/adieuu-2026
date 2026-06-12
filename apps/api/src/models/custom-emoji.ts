/**
 * Custom emoji model
 *
 * Tracks user-uploaded custom emojis (static and animated).
 * Each emoji has a globally unique shortcode that must not collide
 * with built-in emoji shortcodes. Images are stored as public CDN
 * assets (like avatars) and pass through CSAM hash moderation.
 *
 * Per-tier upload limits:
 *   Access  -> 10
 *   Insider -> 25
 *   Lifetime (any product) -> 50
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export interface CustomEmojiDocument extends BaseDocument {
  /** Identity that created/owns this emoji */
  identityId: ObjectId;

  /** Globally unique shortcode (lowercase letters, digits, underscores, hyphens; 2-32 chars) */
  shortcode: string;

  /** Human-readable display name (1-64 chars) */
  name: string;

  /** Media upload ID that produced the CDN asset */
  mediaId: string;

  /** Processed CDN URL (WebP for static, GIF for animated) */
  cdnUrl: string;

  /** Whether this is an animated (GIF) emoji */
  animated: boolean;

  /** Original MIME type of the uploaded file */
  contentType: string;
}

export interface PublicCustomEmoji {
  id: string;
  identityId: string;
  shortcode: string;
  name: string;
  cdnUrl: string;
  animated: boolean;
  createdAt: string;
}

export function toPublicCustomEmoji(doc: CustomEmojiDocument): PublicCustomEmoji {
  return {
    id: doc._id.toHexString(),
    identityId: doc.identityId.toHexString(),
    shortcode: doc.shortcode,
    name: doc.name,
    cdnUrl: doc.cdnUrl,
    animated: doc.animated,
    createdAt: doc.createdAt.toISOString(),
  };
}

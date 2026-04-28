/**
 * Shared types for custom emoji feature.
 */

export interface PublicCustomEmoji {
  id: string;
  identityId: string;
  shortcode: string;
  name: string;
  cdnUrl: string;
  animated: boolean;
  createdAt: string;
}

export interface CustomEmojiListResponse {
  emojis: PublicCustomEmoji[];
  limit: number;
  used: number;
}

export interface CreateCustomEmojiParams {
  shortcode: string;
  name: string;
  mediaId: string;
}

export interface UpdateCustomEmojiParams {
  shortcode?: string;
  name?: string;
}

/**
 * Custom emoji entry embedded in E2E-encrypted message payloads.
 * Stored inline so recipients do not need to query the API
 * for each custom emoji reference.
 */
export interface CustomEmojiPayloadEntry {
  id: string;
  url: string;
  name: string;
  animated: boolean;
}

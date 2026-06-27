/**
 * Community Theme model.
 *
 * Stores publicly shared themes uploaded by identity-authenticated users.
 * Themes include metadata, colour tokens, and moderation state.
 *
 * @module models/community-theme
 */

import type { BaseDocument } from './base';
import type { ObjectId } from 'mongodb';
import type { StoredThemeDefinition } from './user-preferences';

export interface CommunityThemeDocument extends BaseDocument {
  name: string;
  description: string;
  authorIdentityId: ObjectId;
  authorUsername: string;
  theme: StoredThemeDefinition;
  tags: string[];
  colorChecksum: string;
  downloads: number;
  upvotes: number;
  upvotedBy: ObjectId[];
  reported: boolean;
  removedByAdmin: boolean;
}

export interface CreateCommunityThemeInput {
  name: string;
  description: string;
  authorIdentityId: ObjectId;
  authorUsername: string;
  theme: StoredThemeDefinition;
  tags: string[];
  colorChecksum: string;
}

export interface PublicCommunityTheme {
  id: string;
  name: string;
  description: string;
  label: 'community';
  authorIdentityId: string;
  authorUsername: string;
  theme: StoredThemeDefinition;
  tags: string[];
  downloads: number;
  upvotes: number;
  createdAt: string;
}

export function toPublicCommunityTheme(doc: CommunityThemeDocument): PublicCommunityTheme {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    description: doc.description,
    label: 'community',
    authorIdentityId: doc.authorIdentityId.toHexString(),
    authorUsername: doc.authorUsername,
    theme: doc.theme,
    tags: doc.tags,
    downloads: doc.downloads,
    upvotes: doc.upvotes ?? 0,
    createdAt: doc.createdAt.toISOString(),
  };
}

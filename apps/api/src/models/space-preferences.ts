/**
 * Space preferences model
 * Per-identity preferences for individual Spaces (favorites).
 *
 * These are identity-scoped: each identity has their own favorite
 * state for each Space they participate in.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export interface SpacePreferencesDocument extends BaseDocument {
  /** The identity these preferences belong to */
  identityId: ObjectId;

  /** The Space these preferences apply to */
  spaceId: ObjectId;

  /** Whether the Space is pinned as a favourite */
  favorited: boolean;
}

export interface PublicSpacePreferences {
  id: string;
  spaceId: string;
  favorited: boolean;
}

export function toPublicSpacePreferences(doc: SpacePreferencesDocument): PublicSpacePreferences {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    favorited: doc.favorited,
  };
}

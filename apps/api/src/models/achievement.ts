/**
 * Achievement model
 *
 * Tracks achievements awarded to identities. Each record represents a single
 * achievement earned by a single identity.
 *
 * PRIVACY NOTE: Achievement visibility is governed by the identity's
 * privacySettings.achievements field (public | friends | private).
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * Achievement document stored in MongoDB.
 */
export interface AchievementDocument extends BaseDocument {
  /** Identity that earned the achievement */
  identityId: ObjectId;
  /** References a definition in the code-level achievement registry */
  achievementId: string;
  /** When the achievement was awarded */
  awardedAt: Date;
  /** Optional contextual metadata (e.g. friend count at time of award) */
  metadata?: Record<string, unknown>;
}

/**
 * Public achievement representation (safe to send to client).
 */
export interface PublicAchievement {
  id: string;
  achievementId: string;
  /** Present only when viewing your own achievements */
  awardedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Convert an AchievementDocument to PublicAchievement.
 */
export function toPublicAchievement(doc: AchievementDocument): PublicAchievement {
  return {
    id: doc._id.toHexString(),
    achievementId: doc.achievementId,
    awardedAt: doc.awardedAt.toISOString(),
    metadata: doc.metadata,
  };
}

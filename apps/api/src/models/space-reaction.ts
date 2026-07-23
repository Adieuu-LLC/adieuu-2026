/**
 * Space message reaction model.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { PublicSpaceReaction } from '@adieuu/shared';

export interface SpaceReactionDocument extends BaseDocument {
  spaceId: ObjectId;
  channelId: ObjectId;
  messageId: ObjectId;
  identityId: ObjectId;
  emoji: string;
}

export interface CreateSpaceReactionInput {
  spaceId: ObjectId;
  channelId: ObjectId;
  messageId: ObjectId;
  identityId: ObjectId;
  emoji: string;
}

export function toPublicSpaceReaction(doc: SpaceReactionDocument): PublicSpaceReaction {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    channelId: doc.channelId.toHexString(),
    messageId: doc.messageId.toHexString(),
    identityId: doc.identityId.toHexString(),
    emoji: doc.emoji,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Space channel pin model.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export interface SpacePinDocument extends BaseDocument {
  channelId: ObjectId;
  messageId: ObjectId;
  pinnedBy: ObjectId;
  pinnedAt: Date;
}

export interface CreateSpacePinInput {
  channelId: ObjectId;
  messageId: ObjectId;
  pinnedBy: ObjectId;
}

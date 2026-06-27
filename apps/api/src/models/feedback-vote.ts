/**
 * Community feedback upvote model.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export interface FeedbackVoteDocument extends BaseDocument {
  postId: string;
  identityId: ObjectId;
}

export interface CreateFeedbackVoteInput {
  postId: string;
  identityId: ObjectId;
}

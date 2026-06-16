/**
 * Community feedback post model.
 */

import type { ObjectId } from 'mongodb';
import type { FeedbackCategory, FeedbackStatus } from '@adieuu/shared';
import type { BaseDocument } from './base';

export interface FeedbackPostDocument extends BaseDocument {
  /** Human-friendly post identifier (e.g. FB-abc123) */
  postId: string;
  /** Author identity */
  identityId: ObjectId;
  title: string;
  description: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  attachmentMediaIds: string[];
  attachmentUrls: string[];
  upvoteCount: number;
  commentCount: number;
  hasStaffResponse: boolean;
  isOfficial: boolean;
  statusChangedAt?: Date;
  statusChangedBy?: string;
}

export interface CreateFeedbackPostInput {
  postId: string;
  identityId: ObjectId;
  title: string;
  description: string;
  category: FeedbackCategory;
  attachmentMediaIds: string[];
  attachmentUrls: string[];
  isOfficial?: boolean;
}

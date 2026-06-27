/**
 * Community feedback comment model.
 */

import type { ObjectId } from 'mongodb';
import type { FeedbackLinkDirection, FeedbackLinkType, FeedbackResponseLabel } from '@adieuu/shared';
import type { BaseDocument } from './base';

export interface FeedbackCommentDocument extends BaseDocument {
  postId: string;
  identityId: ObjectId;
  body: string;
  responseLabel: FeedbackResponseLabel | null;
  parentCommentId: string | null;
  linkedPostId: string | null;
  linkType: FeedbackLinkType | null;
  linkDirection: FeedbackLinkDirection | null;
}

export interface CreateFeedbackCommentInput {
  postId: string;
  identityId: ObjectId;
  body: string;
  responseLabel: FeedbackResponseLabel | null;
  parentCommentId: string | null;
  linkedPostId: string | null;
  linkType: FeedbackLinkType | null;
  linkDirection: FeedbackLinkDirection | null;
}

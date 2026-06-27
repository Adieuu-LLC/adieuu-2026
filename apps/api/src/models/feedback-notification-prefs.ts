/**
 * Feedback notification preferences model.
 *
 * Stores per-identity opt-in/out for feedback notification types.
 * Plaintext (not E2E-encrypted) because the server must read these
 * to decide whom to notify. Only boolean flags are stored.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export interface FeedbackNotificationPrefsDocument extends BaseDocument {
  identityId: ObjectId;
  notifyPostReplies: boolean;
  notifyCommentReplies: boolean;
  notifyOfficialPosts: boolean;
  /** Tracks when the user last acknowledged official posts (for lazy unread count). */
  lastOfficialPostSeenAt: Date | null;
}

export interface UpsertFeedbackNotificationPrefsInput {
  notifyPostReplies?: boolean;
  notifyCommentReplies?: boolean;
  notifyOfficialPosts?: boolean;
}

export const FEEDBACK_NOTIFICATION_PREFS_DEFAULTS = {
  notifyPostReplies: true,
  notifyCommentReplies: true,
  notifyOfficialPosts: true,
  lastOfficialPostSeenAt: null,
} as const;

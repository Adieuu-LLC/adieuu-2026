/**
 * Feedback notification preferences repository.
 * One document per identity, upserted on first toggle.
 */

import { ObjectId, type Filter, type UpdateFilter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  FeedbackNotificationPrefsDocument,
  UpsertFeedbackNotificationPrefsInput,
} from '../models/feedback-notification-prefs';
import { FEEDBACK_NOTIFICATION_PREFS_DEFAULTS } from '../models/feedback-notification-prefs';
import { withUpdatedAt } from '../models/base';

export class FeedbackNotificationPrefsRepository extends BaseRepository<FeedbackNotificationPrefsDocument> {
  constructor() {
    super(Collections.FEEDBACK_NOTIFICATION_PREFS);
  }

  async findByIdentityId(
    identityId: ObjectId,
  ): Promise<FeedbackNotificationPrefsDocument | null> {
    return this.findOne({ identityId } as Filter<FeedbackNotificationPrefsDocument>);
  }

  async upsert(
    identityId: ObjectId,
    input: UpsertFeedbackNotificationPrefsInput,
  ): Promise<FeedbackNotificationPrefsDocument> {
    const setFields: Record<string, unknown> = withUpdatedAt({});

    if (input.notifyPostReplies !== undefined) {
      setFields.notifyPostReplies = input.notifyPostReplies;
    }
    if (input.notifyCommentReplies !== undefined) {
      setFields.notifyCommentReplies = input.notifyCommentReplies;
    }
    if (input.notifyOfficialPosts !== undefined) {
      setFields.notifyOfficialPosts = input.notifyOfficialPosts;
    }

    const result = await this.collection.findOneAndUpdate(
      { identityId } as Filter<FeedbackNotificationPrefsDocument>,
      {
        $set: setFields,
        $setOnInsert: {
          identityId,
          createdAt: new Date(),
          ...(input.notifyPostReplies === undefined
            ? { notifyPostReplies: FEEDBACK_NOTIFICATION_PREFS_DEFAULTS.notifyPostReplies }
            : {}),
          ...(input.notifyCommentReplies === undefined
            ? { notifyCommentReplies: FEEDBACK_NOTIFICATION_PREFS_DEFAULTS.notifyCommentReplies }
            : {}),
          ...(input.notifyOfficialPosts === undefined
            ? { notifyOfficialPosts: FEEDBACK_NOTIFICATION_PREFS_DEFAULTS.notifyOfficialPosts }
            : {}),
          lastOfficialPostSeenAt: FEEDBACK_NOTIFICATION_PREFS_DEFAULTS.lastOfficialPostSeenAt,
        },
      } as UpdateFilter<FeedbackNotificationPrefsDocument>,
      { upsert: true, returnDocument: 'after' },
    );

    return result as FeedbackNotificationPrefsDocument;
  }

  async setLastOfficialPostSeenAt(
    identityId: ObjectId,
    seenAt: Date,
  ): Promise<void> {
    await this.collection.updateOne(
      { identityId } as Filter<FeedbackNotificationPrefsDocument>,
      {
        $set: withUpdatedAt({ lastOfficialPostSeenAt: seenAt }),
        $setOnInsert: {
          identityId,
          createdAt: new Date(),
          notifyPostReplies: FEEDBACK_NOTIFICATION_PREFS_DEFAULTS.notifyPostReplies,
          notifyCommentReplies: FEEDBACK_NOTIFICATION_PREFS_DEFAULTS.notifyCommentReplies,
          notifyOfficialPosts: FEEDBACK_NOTIFICATION_PREFS_DEFAULTS.notifyOfficialPosts,
        },
      } as UpdateFilter<FeedbackNotificationPrefsDocument>,
      { upsert: true },
    );
  }
}

let feedbackNotificationPrefsRepository: FeedbackNotificationPrefsRepository | null = null;

export function getFeedbackNotificationPrefsRepository(): FeedbackNotificationPrefsRepository {
  if (!feedbackNotificationPrefsRepository) {
    feedbackNotificationPrefsRepository = new FeedbackNotificationPrefsRepository();
  }
  return feedbackNotificationPrefsRepository;
}

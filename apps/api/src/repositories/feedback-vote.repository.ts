/**
 * Feedback vote repository.
 */

import { ObjectId, type Filter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { CreateFeedbackVoteInput, FeedbackVoteDocument } from '../models/feedback-vote';

export class FeedbackVoteRepository extends BaseRepository<FeedbackVoteDocument> {
  constructor() {
    super(Collections.FEEDBACK_VOTES);
  }

  async findByPostAndIdentity(
    postId: string,
    identityId: ObjectId,
  ): Promise<FeedbackVoteDocument | null> {
    return await this.findOne({
      postId,
      identityId,
    } as Filter<FeedbackVoteDocument>);
  }

  async hasVoted(postId: string, identityId: ObjectId): Promise<boolean> {
    const vote = await this.findByPostAndIdentity(postId, identityId);
    return vote !== null;
  }

  async createVote(input: CreateFeedbackVoteInput): Promise<FeedbackVoteDocument> {
    return await super.create(input);
  }

  async deleteByPostAndIdentity(postId: string, identityId: ObjectId): Promise<boolean> {
    const result = await this.collection.deleteOne({
      postId,
      identityId,
    } as Filter<FeedbackVoteDocument>);
    return result.deletedCount === 1;
  }

  async findVotedPostIds(identityId: ObjectId, postIds: string[]): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();
    const votes = await this.findMany({
      identityId,
      postId: { $in: postIds },
    } as Filter<FeedbackVoteDocument>);
    return new Set(votes.map((v) => v.postId));
  }
}

let feedbackVoteRepository: FeedbackVoteRepository | null = null;

export function getFeedbackVoteRepository(): FeedbackVoteRepository {
  if (!feedbackVoteRepository) {
    feedbackVoteRepository = new FeedbackVoteRepository();
  }
  return feedbackVoteRepository;
}

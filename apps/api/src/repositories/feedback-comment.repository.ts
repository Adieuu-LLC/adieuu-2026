/**
 * Feedback comment repository.
 */

import { ObjectId, type Filter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  CreateFeedbackCommentInput,
  FeedbackCommentDocument,
} from '../models/feedback-comment';

export interface FeedbackCommentListResult {
  comments: FeedbackCommentDocument[];
  total: number;
}

export class FeedbackCommentRepository extends BaseRepository<FeedbackCommentDocument> {
  constructor() {
    super(Collections.FEEDBACK_COMMENTS);
  }

  async createComment(input: CreateFeedbackCommentInput): Promise<FeedbackCommentDocument> {
    return await super.create(input);
  }

  async listByPost(
    postId: string,
    page: number,
    limit: number,
  ): Promise<FeedbackCommentListResult> {
    const filter = { postId } as Filter<FeedbackCommentDocument>;
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      this.collection
        .find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      this.collection.countDocuments(filter),
    ]);

    return { comments: comments as FeedbackCommentDocument[], total };
  }

  async listAllByPost(postId: string): Promise<FeedbackCommentDocument[]> {
    return await this.findMany({ postId } as Filter<FeedbackCommentDocument>, 500);
  }

  async listLinksToPost(postId: string): Promise<FeedbackCommentDocument[]> {
    return await this.findMany(
      { linkedPostId: postId } as Filter<FeedbackCommentDocument>,
      500,
    );
  }

  async findByCommentId(commentId: string): Promise<FeedbackCommentDocument | null> {
    if (!ObjectId.isValid(commentId)) return null;
    return await this.findById(commentId);
  }
}

let feedbackCommentRepository: FeedbackCommentRepository | null = null;

export function getFeedbackCommentRepository(): FeedbackCommentRepository {
  if (!feedbackCommentRepository) {
    feedbackCommentRepository = new FeedbackCommentRepository();
  }
  return feedbackCommentRepository;
}

/**
 * Feedback post repository.
 */

import { type ClientSession, type Filter, type Sort } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  CreateFeedbackPostInput,
  FeedbackPostDocument,
} from '../models/feedback-post';
import type { FeedbackCategory, FeedbackSortOption, FeedbackStatus } from '@adieuu/shared';

export interface FeedbackPostListOptions {
  page: number;
  limit: number;
  sort: FeedbackSortOption;
  category?: FeedbackCategory;
  statuses?: FeedbackStatus[];
  hasStaffResponse?: boolean;
  isOfficial?: boolean;
  search?: string;
}

export interface FeedbackPostListResult {
  posts: FeedbackPostDocument[];
  total: number;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class FeedbackPostRepository extends BaseRepository<FeedbackPostDocument> {
  constructor() {
    super(Collections.FEEDBACK_POSTS);
  }

  async createPost(input: CreateFeedbackPostInput): Promise<FeedbackPostDocument> {
    const doc: Omit<FeedbackPostDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      postId: input.postId,
      identityId: input.identityId,
      title: input.title,
      description: input.description,
      category: input.category,
      status: 'submitted',
      attachmentMediaIds: input.attachmentMediaIds,
      attachmentUrls: input.attachmentUrls,
      upvoteCount: 0,
      commentCount: 0,
      hasStaffResponse: false,
      isOfficial: input.isOfficial ?? false,
    };

    return await super.create(doc);
  }

  async findByPostId(postId: string): Promise<FeedbackPostDocument | null> {
    return await this.findOne({ postId } as Filter<FeedbackPostDocument>);
  }

  async listWithFilters(options: FeedbackPostListOptions): Promise<FeedbackPostListResult> {
    const filter: Filter<FeedbackPostDocument> = {};

    if (options.category) {
      filter.category = options.category;
    }
    if (options.statuses !== undefined) {
      if (options.statuses.length === 0) {
        return { posts: [], total: 0 };
      }
      filter.status = { $in: options.statuses };
    }
    if (options.hasStaffResponse !== undefined) {
      filter.hasStaffResponse = options.hasStaffResponse;
    }
    if (options.isOfficial !== undefined) {
      filter.isOfficial = options.isOfficial;
    }
    if (options.search) {
      const regex = new RegExp(escapeRegex(options.search), 'i');
      filter.$or = [{ title: regex }, { description: regex }];
    }

    const sortSpec: Sort =
      options.sort === 'upvotes'
        ? { upvoteCount: -1, createdAt: -1 }
        : options.sort === 'oldest'
          ? { createdAt: 1 }
          : { createdAt: -1 };

    const skip = (options.page - 1) * options.limit;

    const [posts, total] = await Promise.all([
      this.collection.find(filter).sort(sortSpec).skip(skip).limit(options.limit).toArray(),
      this.collection.countDocuments(filter),
    ]);

    return { posts: posts as FeedbackPostDocument[], total };
  }

  async incrementUpvotes(
    postId: string,
    delta: number,
    options?: { session?: ClientSession },
  ): Promise<void> {
    await this.collection.updateOne(
      { postId } as Filter<FeedbackPostDocument>,
      { $inc: { upvoteCount: delta } },
      { session: options?.session },
    );
  }

  async incrementComments(
    postId: string,
    options?: { session?: ClientSession },
  ): Promise<void> {
    await this.collection.updateOne(
      { postId } as Filter<FeedbackPostDocument>,
      { $inc: { commentCount: 1 } },
      { session: options?.session },
    );
  }

  async setHasStaffResponse(
    postId: string,
    options?: { session?: ClientSession },
  ): Promise<void> {
    await this.collection.updateOne(
      { postId } as Filter<FeedbackPostDocument>,
      { $set: { hasStaffResponse: true } },
      { session: options?.session },
    );
  }

  async updateStatus(
    postId: string,
    status: FeedbackStatus,
    changedBy: string,
  ): Promise<FeedbackPostDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { postId } as Filter<FeedbackPostDocument>,
      {
        $set: {
          status,
          statusChangedAt: new Date(),
          statusChangedBy: changedBy,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    return result as FeedbackPostDocument | null;
  }

  async countOfficialSince(since: Date | null): Promise<number> {
    const filter: Filter<FeedbackPostDocument> = { isOfficial: true };
    if (since) {
      filter.createdAt = { $gt: since };
    }
    return await this.count(filter);
  }

  async findByPostIds(postIds: string[]): Promise<FeedbackPostDocument[]> {
    if (postIds.length === 0) return [];
    return await this.findMany({ postId: { $in: postIds } } as Filter<FeedbackPostDocument>);
  }
}

let feedbackPostRepository: FeedbackPostRepository | null = null;

export function getFeedbackPostRepository(): FeedbackPostRepository {
  if (!feedbackPostRepository) {
    feedbackPostRepository = new FeedbackPostRepository();
  }
  return feedbackPostRepository;
}

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
import {
  ROADMAP_TIMELINE_EXCLUDED_STATUSES,
  type FeedbackCategory,
  type FeedbackSortOption,
  type FeedbackStatus,
} from '@adieuu/shared';

export interface FeedbackPostListOptions {
  page: number;
  limit: number;
  sort: FeedbackSortOption;
  category?: FeedbackCategory;
  statuses?: FeedbackStatus[];
  hasStaffResponse?: boolean;
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
    const now = new Date();
    const status = input.status ?? 'submitted';
    const doc: Omit<FeedbackPostDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      postId: input.postId,
      identityId: input.identityId,
      title: input.title,
      description: input.description,
      category: input.category,
      status,
      attachmentMediaIds: input.attachmentMediaIds,
      attachmentUrls: input.attachmentUrls,
      upvoteCount: 0,
      commentCount: 0,
      hasStaffResponse: false,
      isOfficial: false,
      isRoadmapOfficial: input.isRoadmapOfficial ?? false,
      isStaffAuthored: input.isStaffAuthored ?? false,
      showOnTimeline: input.showOnTimeline ?? false,
      ...(input.targetReleaseDate ? { targetReleaseDate: input.targetReleaseDate } : {}),
      ...(status !== 'submitted'
        ? { statusChangedAt: now, statusChangedBy: input.identityId.toHexString() }
        : {}),
      ...(status === 'released'
        ? { releasedAt: input.targetReleaseDate ?? now }
        : {}),
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

  async listRoadmapTimelinePosts(): Promise<FeedbackPostDocument[]> {
    const filter: Filter<FeedbackPostDocument> = {
      showOnTimeline: true,
      status: { $nin: [...ROADMAP_TIMELINE_EXCLUDED_STATUSES] },
    };
    const posts = await this.collection.find(filter).toArray();
    return posts as FeedbackPostDocument[];
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
    releasedAt?: Date,
  ): Promise<FeedbackPostDocument | null> {
    const now = new Date();
    const setFields: Partial<FeedbackPostDocument> & { updatedAt: Date } = {
      status,
      statusChangedAt: now,
      statusChangedBy: changedBy,
      updatedAt: now,
    };
    if (status === 'released' && releasedAt) {
      setFields.releasedAt = releasedAt;
    }

    const result = await this.collection.findOneAndUpdate(
      { postId } as Filter<FeedbackPostDocument>,
      { $set: setFields },
      { returnDocument: 'after' },
    );
    return result as FeedbackPostDocument | null;
  }

  async updateRoadmapSettings(
    postId: string,
    updates: {
      showOnTimeline?: boolean;
      isRoadmapOfficial?: boolean;
      targetReleaseDate?: Date | null;
    },
  ): Promise<FeedbackPostDocument | null> {
    const now = new Date();
    const setFields: Partial<FeedbackPostDocument> & { updatedAt: Date } = {
      updatedAt: now,
    };
    const unsetFields: Partial<Record<keyof FeedbackPostDocument, ''>> = {};

    if (updates.showOnTimeline !== undefined) {
      setFields.showOnTimeline = updates.showOnTimeline;
    }
    if (updates.isRoadmapOfficial !== undefined) {
      setFields.isRoadmapOfficial = updates.isRoadmapOfficial;
    }
    if (updates.targetReleaseDate === null) {
      unsetFields.targetReleaseDate = '';
    } else if (updates.targetReleaseDate !== undefined) {
      setFields.targetReleaseDate = updates.targetReleaseDate;
    }

    const update: Record<string, unknown> = { $set: setFields };
    if (Object.keys(unsetFields).length > 0) {
      update.$unset = unsetFields;
    }

    const result = await this.collection.findOneAndUpdate(
      { postId } as Filter<FeedbackPostDocument>,
      update,
      { returnDocument: 'after' },
    );
    return result as FeedbackPostDocument | null;
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

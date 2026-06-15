/**
 * Community feedback service — posts, upvotes, comments, and status management.
 */

import { ObjectId } from 'mongodb';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  MAX_FEEDBACK_ATTACHMENTS,
  MAX_FEEDBACK_BODY_LENGTH,
  MAX_FEEDBACK_COMMENT_LENGTH,
  MAX_FEEDBACK_POSTS_PER_DAY,
  MAX_FEEDBACK_TITLE_LENGTH,
  type FeedbackCategory,
  type FeedbackResponseLabel,
  type FeedbackSortOption,
  type FeedbackStatus,
} from '@adieuu/shared';
import type { FeedbackPostDocument } from '../models/feedback-post';
import type { FeedbackCommentDocument } from '../models/feedback-comment';
import type { IdentityDocument } from '../models/identity';
import { getFeedbackPostRepository } from '../repositories/feedback-post.repository';
import { getFeedbackVoteRepository } from '../repositories/feedback-vote.repository';
import { getFeedbackCommentRepository } from '../repositories/feedback-comment.repository';
import { getMediaUploadRepository } from '../repositories/media-upload.repository';
import { getIdentityRepository } from '../repositories/identity.repository';
import { getPlatformCapabilities } from './platform-capabilities.service';
import { checkRateLimit, type RateLimitConfig } from './rate-limit.service';
import { sanitizeString } from '../utils/sanitize';

const FEEDBACK_CREATE_RATE_LIMIT: RateLimitConfig = {
  limit: MAX_FEEDBACK_POSTS_PER_DAY,
  windowSeconds: 86400,
};

const FEEDBACK_COMMENT_RATE_LIMIT: RateLimitConfig = {
  limit: 20,
  windowSeconds: 600,
};

export const ADIEUU_DEV_ENTITLEMENT = 'adieuu-dev';

export type FeedbackErrorCode =
  | 'INVALID_CATEGORY'
  | 'INVALID_STATUS'
  | 'TITLE_TOO_LONG'
  | 'BODY_TOO_LONG'
  | 'COMMENT_TOO_LONG'
  | 'TOO_MANY_ATTACHMENTS'
  | 'INVALID_ATTACHMENT'
  | 'ATTACHMENT_NOT_READY'
  | 'ATTACHMENT_NOT_OWNED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'ALREADY_UPVOTED'
  | 'NOT_UPVOTED';

export type ServiceResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode: FeedbackErrorCode };

function generatePostId(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(6));
  const randomPart = Array.from(randomBytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 8);
  return `FB-${randomPart}`;
}

function hasAdieuuDevEntitlement(identity: IdentityDocument, sessionEntitlements: string[] = []): boolean {
  const overrides = identity.entitlementOverrides ?? [];
  return overrides.includes(ADIEUU_DEV_ENTITLEMENT) || sessionEntitlements.includes(ADIEUU_DEV_ENTITLEMENT);
}

export async function canManageFeedbackStatus(
  identity: IdentityDocument,
  sessionEntitlements: string[] = [],
): Promise<boolean> {
  const caps = await getPlatformCapabilities(identity._id);
  if (!caps.isPlatformAdmin && !caps.isPlatformModerator) {
    return false;
  }
  return hasAdieuuDevEntitlement(identity, sessionEntitlements);
}

async function resolveResponseLabel(
  identity: IdentityDocument,
  sessionEntitlements: string[] = [],
): Promise<FeedbackResponseLabel | null> {
  const caps = await getPlatformCapabilities(identity._id);
  if (!caps.isPlatformAdmin && !caps.isPlatformModerator) {
    return null;
  }
  return hasAdieuuDevEntitlement(identity, sessionEntitlements)
    ? 'dev_response'
    : 'staff_response';
}

async function validateAttachments(
  identityId: string,
  attachmentMediaIds: string[],
): Promise<ServiceResult<{ mediaIds: string[]; urls: string[] }>> {
  if (attachmentMediaIds.length > MAX_FEEDBACK_ATTACHMENTS) {
    return {
      success: false,
      error: `Maximum ${MAX_FEEDBACK_ATTACHMENTS} attachments allowed`,
      errorCode: 'TOO_MANY_ATTACHMENTS',
    };
  }

  if (attachmentMediaIds.length === 0) {
    return { success: true, data: { mediaIds: [], urls: [] } };
  }

  const mediaRepo = getMediaUploadRepository();
  const uniqueIds = [...new Set(attachmentMediaIds)];
  const urls: string[] = [];

  for (const mediaId of uniqueIds) {
    const doc = await mediaRepo.findByMediaId(mediaId);
    if (!doc || doc.purpose !== 'feedback_attachment') {
      return { success: false, error: 'Invalid attachment', errorCode: 'INVALID_ATTACHMENT' };
    }

    if (doc.status !== 'ready' || !doc.cdnUrl) {
      return {
        success: false,
        error: 'Attachment is not ready',
        errorCode: 'ATTACHMENT_NOT_READY',
      };
    }

    const ownerId = doc.identityId?.toHexString();
    if (ownerId !== identityId) {
      return {
        success: false,
        error: 'Attachment not owned by submitter',
        errorCode: 'ATTACHMENT_NOT_OWNED',
      };
    }

    urls.push(doc.cdnUrl);
  }

  return { success: true, data: { mediaIds: uniqueIds, urls } };
}

export interface CreateFeedbackPostInput {
  title: string;
  description: string;
  category: string;
  attachmentMediaIds?: string[];
}

export async function createFeedbackPost(
  identityId: string,
  input: CreateFeedbackPostInput,
): Promise<ServiceResult<{ postId: string }>> {
  const rl = await checkRateLimit('feedback:create', identityId, FEEDBACK_CREATE_RATE_LIMIT);
  if (!rl.allowed) {
    return { success: false, error: 'Rate limit exceeded', errorCode: 'RATE_LIMITED' };
  }

  if (!FEEDBACK_CATEGORIES.includes(input.category as FeedbackCategory)) {
    return { success: false, error: 'Invalid category', errorCode: 'INVALID_CATEGORY' };
  }

  const title = sanitizeString(input.title.trim(), 'general').value;
  const description = sanitizeString(input.description.trim(), 'general').value;

  if (title.length === 0 || title.length > MAX_FEEDBACK_TITLE_LENGTH) {
    return { success: false, error: 'Invalid title length', errorCode: 'TITLE_TOO_LONG' };
  }

  if (description.length === 0 || description.length > MAX_FEEDBACK_BODY_LENGTH) {
    return { success: false, error: 'Invalid description length', errorCode: 'BODY_TOO_LONG' };
  }

  const attachmentIds = input.attachmentMediaIds ?? [];
  const attachmentResult = await validateAttachments(identityId, attachmentIds);
  if (!attachmentResult.success) {
    return attachmentResult;
  }

  const postRepo = getFeedbackPostRepository();
  const post = await postRepo.createPost({
    postId: generatePostId(),
    identityId: new ObjectId(identityId),
    title,
    description,
    category: input.category as FeedbackCategory,
    attachmentMediaIds: attachmentResult.data.mediaIds,
    attachmentUrls: attachmentResult.data.urls,
  });

  return { success: true, data: { postId: post.postId } };
}

export interface FeedbackListQuery {
  page: number;
  limit: number;
  sort: FeedbackSortOption;
  category?: FeedbackCategory;
  status?: FeedbackStatus;
  hasStaffResponse?: boolean;
  search?: string;
}

export async function listFeedbackPosts(
  query: FeedbackListQuery,
  viewerIdentityId?: string,
): Promise<ServiceResult<{ posts: FeedbackPostDocument[]; total: number; votedPostIds: Set<string> }>> {
  const postRepo = getFeedbackPostRepository();
  const result = await postRepo.listWithFilters(query);

  let votedPostIds = new Set<string>();
  if (viewerIdentityId && result.posts.length > 0) {
    const voteRepo = getFeedbackVoteRepository();
    votedPostIds = await voteRepo.findVotedPostIds(
      new ObjectId(viewerIdentityId),
      result.posts.map((p) => p.postId),
    );
  }

  return {
    success: true,
    data: {
      posts: result.posts,
      total: result.total,
      votedPostIds,
    },
  };
}

export async function getFeedbackPostDetail(
  postId: string,
  viewerIdentityId?: string,
  sessionEntitlements: string[] = [],
): Promise<
  ServiceResult<{
    post: FeedbackPostDocument;
    comments: FeedbackCommentDocument[];
    hasUpvoted: boolean;
    canManageStatus: boolean;
  }>
> {
  const postRepo = getFeedbackPostRepository();
  const post = await postRepo.findByPostId(postId);
  if (!post) {
    return { success: false, error: 'Post not found', errorCode: 'NOT_FOUND' };
  }

  const commentRepo = getFeedbackCommentRepository();
  const comments = await commentRepo.listAllByPost(postId);

  let hasUpvoted = false;
  let canManageStatus = false;

  if (viewerIdentityId) {
    const voteRepo = getFeedbackVoteRepository();
    hasUpvoted = await voteRepo.hasVoted(postId, new ObjectId(viewerIdentityId));

    const identityRepo = getIdentityRepository();
    const identity = await identityRepo.findById(viewerIdentityId);
    if (identity) {
      canManageStatus = await canManageFeedbackStatus(identity, sessionEntitlements);
    }
  }

  return {
    success: true,
    data: { post, comments, hasUpvoted, canManageStatus },
  };
}

export async function upvoteFeedbackPost(
  postId: string,
  identityId: string,
): Promise<ServiceResult<{ upvoteCount: number; hasUpvoted: boolean }>> {
  const postRepo = getFeedbackPostRepository();
  const post = await postRepo.findByPostId(postId);
  if (!post) {
    return { success: false, error: 'Post not found', errorCode: 'NOT_FOUND' };
  }

  const voteRepo = getFeedbackVoteRepository();
  const existing = await voteRepo.findByPostAndIdentity(postId, new ObjectId(identityId));
  if (existing) {
    return { success: false, error: 'Already upvoted', errorCode: 'ALREADY_UPVOTED' };
  }

  await voteRepo.createVote({ postId, identityId: new ObjectId(identityId) });
  await postRepo.incrementUpvotes(postId, 1);

  const updated = await postRepo.findByPostId(postId);
  return {
    success: true,
    data: {
      upvoteCount: updated?.upvoteCount ?? post.upvoteCount + 1,
      hasUpvoted: true,
    },
  };
}

export async function removeFeedbackUpvote(
  postId: string,
  identityId: string,
): Promise<ServiceResult<{ upvoteCount: number; hasUpvoted: boolean }>> {
  const postRepo = getFeedbackPostRepository();
  const post = await postRepo.findByPostId(postId);
  if (!post) {
    return { success: false, error: 'Post not found', errorCode: 'NOT_FOUND' };
  }

  const voteRepo = getFeedbackVoteRepository();
  const deleted = await voteRepo.deleteByPostAndIdentity(postId, new ObjectId(identityId));
  if (!deleted) {
    return { success: false, error: 'Not upvoted', errorCode: 'NOT_UPVOTED' };
  }

  await postRepo.incrementUpvotes(postId, -1);

  const updated = await postRepo.findByPostId(postId);
  return {
    success: true,
    data: {
      upvoteCount: Math.max(0, updated?.upvoteCount ?? post.upvoteCount - 1),
      hasUpvoted: false,
    },
  };
}

export async function addFeedbackComment(
  postId: string,
  identity: IdentityDocument,
  body: string,
  sessionEntitlements: string[] = [],
): Promise<ServiceResult<FeedbackCommentDocument>> {
  const rl = await checkRateLimit(
    'feedback:comment',
    identity._id.toHexString(),
    FEEDBACK_COMMENT_RATE_LIMIT,
  );
  if (!rl.allowed) {
    return { success: false, error: 'Rate limit exceeded', errorCode: 'RATE_LIMITED' };
  }

  const postRepo = getFeedbackPostRepository();
  const post = await postRepo.findByPostId(postId);
  if (!post) {
    return { success: false, error: 'Post not found', errorCode: 'NOT_FOUND' };
  }

  const sanitizedBody = sanitizeString(body.trim(), 'general').value;
  if (sanitizedBody.length === 0 || sanitizedBody.length > MAX_FEEDBACK_COMMENT_LENGTH) {
    return { success: false, error: 'Invalid comment length', errorCode: 'COMMENT_TOO_LONG' };
  }

  const responseLabel = await resolveResponseLabel(identity, sessionEntitlements);

  const commentRepo = getFeedbackCommentRepository();
  const comment = await commentRepo.createComment({
    postId,
    identityId: identity._id,
    body: sanitizedBody,
    responseLabel,
  });

  await postRepo.incrementComments(postId);
  if (responseLabel !== null) {
    await postRepo.setHasStaffResponse(postId);
  }

  return { success: true, data: comment };
}

export async function updateFeedbackStatus(
  postId: string,
  identity: IdentityDocument,
  newStatus: string,
  sessionEntitlements: string[] = [],
): Promise<ServiceResult<void>> {
  if (!FEEDBACK_STATUSES.includes(newStatus as FeedbackStatus)) {
    return { success: false, error: 'Invalid status', errorCode: 'INVALID_STATUS' };
  }

  const allowed = await canManageFeedbackStatus(identity, sessionEntitlements);
  if (!allowed) {
    return { success: false, error: 'Forbidden', errorCode: 'FORBIDDEN' };
  }

  const postRepo = getFeedbackPostRepository();
  const post = await postRepo.findByPostId(postId);
  if (!post) {
    return { success: false, error: 'Post not found', errorCode: 'NOT_FOUND' };
  }

  await postRepo.updateStatus(postId, newStatus as FeedbackStatus, identity._id.toHexString());
  return { success: true, data: undefined };
}

export async function resolveFeedbackAuthors(
  identityIds: string[],
): Promise<Map<string, { displayName: string; username: string; avatarUrl?: string }>> {
  const map = new Map<string, { displayName: string; username: string; avatarUrl?: string }>();
  if (identityIds.length === 0) return map;

  const identityRepo = getIdentityRepository();
  const uniqueIds = [...new Set(identityIds)];

  await Promise.all(
    uniqueIds.map(async (id) => {
      const identity = await identityRepo.findById(id);
      if (identity) {
        map.set(id, {
          displayName: identity.displayName ?? identity.username ?? 'Unknown',
          username: identity.username ?? '',
          avatarUrl: identity.avatarUrl,
        });
      }
    }),
  );

  return map;
}

export async function buildAttachmentList(
  mediaIds: string[],
  urls: string[],
): Promise<Array<{ mediaId: string; cdnUrl: string; contentType: string }>> {
  if (mediaIds.length === 0) return [];

  const mediaRepo = getMediaUploadRepository();
  const attachments: Array<{ mediaId: string; cdnUrl: string; contentType: string }> = [];

  for (let i = 0; i < mediaIds.length; i++) {
    const mediaId = mediaIds[i]!;
    const doc = await mediaRepo.findByMediaId(mediaId);
    attachments.push({
      mediaId,
      cdnUrl: urls[i] ?? doc?.cdnUrl ?? '',
      contentType: doc?.contentType ?? 'image/jpeg',
    });
  }

  return attachments;
}

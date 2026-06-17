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
  buildFeedbackLinkCommentBody,
  buildFeedbackReciprocalLinkCommentBody,
  excerptFeedbackComment,
  isFeedbackLinkType,
  buildRoadmapTimeline,
  parseTargetReleaseDate,
  type FeedbackCategory,
  type FeedbackLinkType,
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
import { createNotification } from './notification.service';
import { checkAndAward } from './achievement.service';
import { getFeedbackNotificationPrefsRepository } from '../repositories/feedback-notification-prefs.repository';
import { FEEDBACK_NOTIFICATION_PREFS_DEFAULTS } from '../models/feedback-notification-prefs';
import { withTransaction } from '../db';
import elog from '../utils/adieuuLogger';

const FEEDBACK_CREATE_RATE_LIMIT: RateLimitConfig = {
  limit: MAX_FEEDBACK_POSTS_PER_DAY,
  windowSeconds: 86400,
};

const FEEDBACK_COMMENT_RATE_LIMIT: RateLimitConfig = {
  limit: 20,
  windowSeconds: 600,
};

const FEEDBACK_SUGGESTION_CATEGORIES: readonly FeedbackCategory[] = [
  'feature',
  'improvement',
  'other',
];

function isFeedbackSuggestionCategory(category: FeedbackCategory): boolean {
  return FEEDBACK_SUGGESTION_CATEGORIES.includes(category);
}

const FEEDBACK_SUGGESTION_ACCEPTED_STATUSES = new Set<FeedbackStatus>([
  'planned',
  'roadmapped',
  'in_progress',
  'internal_testing',
  'public_testing',
  'released',
]);

function isFeedbackSuggestionAcceptedStatus(status: FeedbackStatus): boolean {
  return FEEDBACK_SUGGESTION_ACCEPTED_STATUSES.has(status);
}

function awardFeedbackSuggestionAchievements(
  authorIdentityId: ObjectId,
  category: FeedbackCategory,
  status: FeedbackStatus,
): void {
  if (!isFeedbackSuggestionCategory(category)) return;

  if (isFeedbackSuggestionAcceptedStatus(status)) {
    checkAndAward(authorIdentityId, 'feedback_suggestion_accepted').catch(() => {});
  }
  if (status === 'released') {
    checkAndAward(authorIdentityId, 'feedback_suggestion_released').catch(() => {});
  }
}

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
  | 'NOT_UPVOTED'
  | 'INVALID_PARENT'
  | 'INVALID_LINK';

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
  isRoadmapOfficial?: boolean;
  targetReleaseDate?: string;
  status?: string;
}

export async function canManageFeedbackCreateFields(
  identity: IdentityDocument,
  sessionEntitlements: string[] = [],
): Promise<boolean> {
  return canManageFeedbackStatus(identity, sessionEntitlements);
}

export async function createFeedbackPost(
  identity: IdentityDocument,
  input: CreateFeedbackPostInput,
  sessionEntitlements: string[] = [],
): Promise<ServiceResult<{ postId: string }>> {
  const identityId = identity._id.toHexString();
  const rl = await checkRateLimit('feedback:create', identityId, FEEDBACK_CREATE_RATE_LIMIT);
  if (!rl.allowed) {
    return { success: false, error: 'Rate limit exceeded', errorCode: 'RATE_LIMITED' };
  }

  if (!FEEDBACK_CATEGORIES.includes(input.category as FeedbackCategory)) {
    return { success: false, error: 'Invalid category', errorCode: 'INVALID_CATEGORY' };
  }

  const title = sanitizeString(input.title.trim(), 'general').value;
  const description = sanitizeString(input.description.trim(), 'general').value;
  const canStaffSubmit = await canManageFeedbackCreateFields(identity, sessionEntitlements);

  if (title.length === 0 || title.length > MAX_FEEDBACK_TITLE_LENGTH) {
    return { success: false, error: 'Invalid title length', errorCode: 'TITLE_TOO_LONG' };
  }

  if (description.length === 0 && !canStaffSubmit) {
    return { success: false, error: 'Invalid description length', errorCode: 'BODY_TOO_LONG' };
  }

  if (description.length > MAX_FEEDBACK_BODY_LENGTH) {
    return { success: false, error: 'Invalid description length', errorCode: 'BODY_TOO_LONG' };
  }

  const attachmentIds = input.attachmentMediaIds ?? [];
  const attachmentResult = await validateAttachments(identityId, attachmentIds);
  if (!attachmentResult.success) {
    return attachmentResult;
  }

  const wantsRoadmapOfficial = input.isRoadmapOfficial === true;
  const wantsTargetDate = Boolean(input.targetReleaseDate?.trim());
  const wantsStatus = input.status !== undefined && input.status !== 'submitted';
  const hasPrivilegedFields = wantsRoadmapOfficial || wantsTargetDate || wantsStatus;

  if (hasPrivilegedFields) {
    const allowed = await canManageFeedbackCreateFields(identity, sessionEntitlements);
    if (!allowed) {
      return { success: false, error: 'Forbidden', errorCode: 'FORBIDDEN' };
    }
  }

  let parsedTargetDate: Date | undefined;
  if (wantsTargetDate) {
    parsedTargetDate = parseTargetReleaseDate(input.targetReleaseDate!.trim()) ?? undefined;
    if (!parsedTargetDate) {
      return { success: false, error: 'Invalid target release date', errorCode: 'INVALID_STATUS' };
    }
  }

  let initialStatus: FeedbackStatus = 'submitted';
  if (input.status !== undefined) {
    if (!FEEDBACK_STATUSES.includes(input.status as FeedbackStatus)) {
      return { success: false, error: 'Invalid status', errorCode: 'INVALID_STATUS' };
    }
    initialStatus = input.status as FeedbackStatus;
  }

  const isRoadmapOfficial = wantsRoadmapOfficial || Boolean(parsedTargetDate);
  if (initialStatus !== 'submitted' && !isRoadmapOfficial) {
    return { success: false, error: 'Official roadmap entry required for initial status', errorCode: 'FORBIDDEN' };
  }

  const postRepo = getFeedbackPostRepository();
  const post = await postRepo.createPost({
    postId: generatePostId(),
    identityId: identity._id,
    title,
    description,
    category: input.category as FeedbackCategory,
    attachmentMediaIds: attachmentResult.data.mediaIds,
    attachmentUrls: attachmentResult.data.urls,
    status: initialStatus,
    isRoadmapOfficial,
    isStaffAuthored: canStaffSubmit,
    targetReleaseDate: parsedTargetDate,
  });

  if (isFeedbackSuggestionAcceptedStatus(initialStatus)) {
    awardFeedbackSuggestionAchievements(post.identityId, post.category, initialStatus);
  }

  return { success: true, data: { postId: post.postId } };
}

export interface FeedbackListQuery {
  page: number;
  limit: number;
  sort: FeedbackSortOption;
  category?: FeedbackCategory;
  statuses?: FeedbackStatus[];
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

export interface RelatedFeedbackPostData {
  postId: string;
  title: string;
  linkType: FeedbackLinkType;
  suggestedByIdentityId: string;
}

export async function getFeedbackPostDetail(
  postId: string,
  viewerIdentityId?: string,
  sessionEntitlements: string[] = [],
): Promise<
  ServiceResult<{
    post: FeedbackPostDocument;
    comments: FeedbackCommentDocument[];
    relatedPosts: RelatedFeedbackPostData[];
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
  const relatedPosts = await buildRelatedPostsForPost(postId, comments, postRepo, commentRepo);

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
    data: { post, comments, relatedPosts, hasUpvoted, canManageStatus },
  };
}

async function buildRelatedPostsForPost(
  postId: string,
  comments: FeedbackCommentDocument[],
  postRepo: ReturnType<typeof getFeedbackPostRepository>,
  commentRepo: ReturnType<typeof getFeedbackCommentRepository>,
): Promise<RelatedFeedbackPostData[]> {
  const inboundComments = await commentRepo.listLinksToPost(postId);
  const allLinkComments = [...comments, ...inboundComments]
    .filter((comment) => comment.linkedPostId && comment.linkType)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (allLinkComments.length === 0) {
    return [];
  }

  const seenPostIds = new Set<string>();
  const uniqueLinkComments: FeedbackCommentDocument[] = [];
  for (const comment of allLinkComments) {
    const relatedPostId =
      comment.postId === postId ? comment.linkedPostId! : comment.postId;
    if (seenPostIds.has(relatedPostId)) continue;
    seenPostIds.add(relatedPostId);
    uniqueLinkComments.push(comment);
  }

  const relatedPostIds = uniqueLinkComments.map((comment) =>
    comment.postId === postId ? comment.linkedPostId! : comment.postId,
  );
  const linkedPosts = await postRepo.findByPostIds(relatedPostIds);
  const titleByPostId = new Map(linkedPosts.map((linkedPost) => [linkedPost.postId, linkedPost.title]));

  return uniqueLinkComments
    .map((comment) => {
      const relatedPostId =
        comment.postId === postId ? comment.linkedPostId! : comment.postId;
      const title = titleByPostId.get(relatedPostId);
      if (!title) return null;
      return {
        postId: relatedPostId,
        title,
        linkType: comment.linkType!,
        suggestedByIdentityId: comment.identityId.toHexString(),
      };
    })
    .filter((entry): entry is RelatedFeedbackPostData => entry !== null);
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

  if (post.identityId.toHexString() === identityId) {
    return { success: false, error: 'Cannot upvote own post', errorCode: 'FORBIDDEN' };
  }

  const voteRepo = getFeedbackVoteRepository();
  const existing = await voteRepo.findByPostAndIdentity(postId, new ObjectId(identityId));
  if (existing) {
    return { success: false, error: 'Already upvoted', errorCode: 'ALREADY_UPVOTED' };
  }

  await withTransaction(async (session) => {
    await voteRepo.createVote({ postId, identityId: new ObjectId(identityId) }, { session });
    await postRepo.incrementUpvotes(postId, 1, { session });
  });

  const updated = await postRepo.findByPostId(postId);
  const upvoteCount = updated?.upvoteCount ?? post.upvoteCount + 1;

  checkAndAward(new ObjectId(identityId), 'feedback_upvoted').catch(() => {});
  if (upvoteCount >= 10) {
    checkAndAward(post.identityId, 'feedback_post_10_upvotes').catch(() => {});
  }

  return {
    success: true,
    data: {
      upvoteCount,
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
  try {
    await withTransaction(async (session) => {
      const deleted = await voteRepo.deleteByPostAndIdentity(
        postId,
        new ObjectId(identityId),
        { session },
      );
      if (!deleted) {
        throw new Error('NOT_UPVOTED');
      }
      await postRepo.incrementUpvotes(postId, -1, { session });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_UPVOTED') {
      return { success: false, error: 'Not upvoted', errorCode: 'NOT_UPVOTED' };
    }
    throw error;
  }

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
  parentCommentId?: string,
  linkedPostId?: string,
  linkType?: string,
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

  const isLinkComment = Boolean(linkedPostId || linkType);
  let resolvedLinkedPostId: string | null = null;
  let resolvedLinkType: FeedbackLinkType | null = null;
  let commentBody = sanitizeString(body.trim(), 'general').value;

  if (isLinkComment) {
    if (!linkedPostId || !linkType || !isFeedbackLinkType(linkType)) {
      return { success: false, error: 'Invalid post link', errorCode: 'INVALID_LINK' };
    }

    if (linkedPostId === postId) {
      return { success: false, error: 'Cannot link a post to itself', errorCode: 'INVALID_LINK' };
    }

    const linkedPost = await postRepo.findByPostId(linkedPostId);
    if (!linkedPost) {
      return { success: false, error: 'Linked post not found', errorCode: 'NOT_FOUND' };
    }

    resolvedLinkedPostId = linkedPostId;
    resolvedLinkType = linkType;
    commentBody = buildFeedbackLinkCommentBody(linkType, linkedPost.title);
  } else if (commentBody.length === 0 || commentBody.length > MAX_FEEDBACK_COMMENT_LENGTH) {
    return { success: false, error: 'Invalid comment length', errorCode: 'COMMENT_TOO_LONG' };
  }

  if (commentBody.length > MAX_FEEDBACK_COMMENT_LENGTH) {
    return { success: false, error: 'Invalid comment length', errorCode: 'COMMENT_TOO_LONG' };
  }

  const responseLabel = await resolveResponseLabel(identity, sessionEntitlements);

  const commentRepo = getFeedbackCommentRepository();
  let resolvedParentCommentId: string | null = null;

  if (parentCommentId && !isLinkComment) {
    const parent = await commentRepo.findByCommentId(parentCommentId);
    if (!parent || parent.postId !== postId) {
      return { success: false, error: 'Invalid parent comment', errorCode: 'INVALID_PARENT' };
    }
    resolvedParentCommentId = parentCommentId;
  }

  const comment = await withTransaction(async (session) => {
    const created = await commentRepo.createComment(
      {
        postId,
        identityId: identity._id,
        body: commentBody,
        responseLabel,
        parentCommentId: resolvedParentCommentId,
        linkedPostId: resolvedLinkedPostId,
        linkType: resolvedLinkType,
        linkDirection: isLinkComment ? 'outbound' : null,
      },
      { session },
    );

    await postRepo.incrementComments(postId, { session });
    if (responseLabel !== null) {
      await postRepo.setHasStaffResponse(postId, { session });
    }

    if (isLinkComment && resolvedLinkedPostId && resolvedLinkType) {
      const reciprocalBody = buildFeedbackReciprocalLinkCommentBody(resolvedLinkType, post.title);
      await commentRepo.createComment(
        {
          postId: resolvedLinkedPostId,
          identityId: identity._id,
          body: reciprocalBody,
          responseLabel: null,
          parentCommentId: null,
          linkedPostId: postId,
          linkType: resolvedLinkType,
          linkDirection: 'inbound',
        },
        { session },
      );
      await postRepo.incrementComments(resolvedLinkedPostId, { session });
    }

    return created;
  });

  void emitFeedbackCommentNotifications(
    post,
    comment,
    identity,
    resolvedParentCommentId ?? undefined,
  );

  if (isLinkComment) {
    checkAndAward(identity._id, 'feedback_post_linked').catch(() => {});
  }

  return { success: true, data: comment };
}

/**
 * Fire-and-forget: notify post author of replies and parent comment author of replies.
 * At most 2 notifications per comment (O(1)), both preference lookups run concurrently.
 */
async function emitFeedbackCommentNotifications(
  post: FeedbackPostDocument,
  comment: FeedbackCommentDocument,
  commenter: IdentityDocument,
  parentCommentId?: string,
): Promise<void> {
  try {
    const prefsRepo = getFeedbackNotificationPrefsRepository();
    const commenterId = commenter._id.toHexString();
    const postAuthorId = post.identityId.toHexString();
    const commenterUsername = commenter.username ?? 'someone';

    const postAuthorNotify = postAuthorId !== commenterId
      ? (async () => {
          const prefs = await prefsRepo.findByIdentityId(post.identityId);
          const shouldNotify = prefs?.notifyPostReplies ?? FEEDBACK_NOTIFICATION_PREFS_DEFAULTS.notifyPostReplies;
          if (shouldNotify) {
            await createNotification(post.identityId, 'feedback_post_reply', {
              postId: post.postId,
              postTitle: post.title,
              commenterUsername,
            });
          }
        })()
      : Promise.resolve();

    const parentAuthorNotify = parentCommentId
      ? (async () => {
          const commentRepo = getFeedbackCommentRepository();
          const parent = await commentRepo.findByCommentId(parentCommentId);
          if (!parent) return;

          const parentAuthorId = parent.identityId.toHexString();
          if (parentAuthorId === commenterId || parentAuthorId === postAuthorId) return;

          const prefs = await prefsRepo.findByIdentityId(parent.identityId);
          const shouldNotify = prefs?.notifyCommentReplies ?? FEEDBACK_NOTIFICATION_PREFS_DEFAULTS.notifyCommentReplies;
          if (shouldNotify) {
            await createNotification(parent.identityId, 'feedback_comment_reply', {
              postId: post.postId,
              postTitle: post.title,
              parentCommentExcerpt: excerptFeedbackComment(parent.body),
              commenterUsername,
            });
          }
        })()
      : Promise.resolve();

    await Promise.all([postAuthorNotify, parentAuthorNotify]);
  } catch (err) {
    elog.warn('Failed to emit feedback comment notifications', { error: err });
  }
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

  const updated = await postRepo.updateStatus(
    postId,
    newStatus as FeedbackStatus,
    identity._id.toHexString(),
    newStatus === 'released'
      ? (post.releasedAt ?? post.targetReleaseDate ?? new Date())
      : undefined,
  );
  if (!updated) {
    return { success: false, error: 'Post not found', errorCode: 'NOT_FOUND' };
  }
  awardFeedbackSuggestionAchievements(
    post.identityId,
    post.category,
    newStatus as FeedbackStatus,
  );
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

export async function getRoadmapTimelinePosts(): Promise<
  ServiceResult<{ posts: FeedbackPostDocument[] }>
> {
  const postRepo = getFeedbackPostRepository();
  const posts = await postRepo.listRoadmapTimelinePosts();
  return { success: true, data: { posts } };
}

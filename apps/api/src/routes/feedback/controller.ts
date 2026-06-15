/**
 * Community feedback controller — validation and response mapping.
 *
 * @module routes/feedback/controller
 */

import { z } from '@adieuu/shared/schemas';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  FEEDBACK_SORT_OPTIONS,
  MAX_FEEDBACK_ATTACHMENTS,
  MAX_FEEDBACK_BODY_LENGTH,
  MAX_FEEDBACK_COMMENT_LENGTH,
  MAX_FEEDBACK_TITLE_LENGTH,
  isFeedbackCategory,
  isFeedbackSortOption,
  isFeedbackStatus,
  type FeedbackCategory,
  type FeedbackSortOption,
  type FeedbackStatus,
} from '@adieuu/shared';
import type { FeedbackPostDocument } from '../../models/feedback-post';
import type { FeedbackCommentDocument } from '../../models/feedback-comment';
import type { IdentityContext } from '../../middleware/identity-session';
import {
  addFeedbackComment,
  buildAttachmentList,
  createFeedbackPost,
  getFeedbackPostDetail,
  listFeedbackPosts,
  removeFeedbackUpvote,
  resolveFeedbackAuthors,
  upvoteFeedbackPost,
  updateFeedbackStatus,
} from '../../services/feedback.service';

export type FeedbackFailureKind =
  | 'validation_failed'
  | 'bad_request'
  | 'not_found'
  | 'forbidden'
  | 'rate_limited'
  | 'unauthorized'
  | 'conflict';

export type FeedbackResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; kind: FeedbackFailureKind; message?: string };

export const CreateFeedbackPostSchema = z.object({
  title: z.string().min(1).max(MAX_FEEDBACK_TITLE_LENGTH),
  description: z.string().min(1).max(MAX_FEEDBACK_BODY_LENGTH),
  category: z.enum(FEEDBACK_CATEGORIES as unknown as [string, ...string[]]),
  attachmentMediaIds: z.array(z.string().min(1).max(200)).max(MAX_FEEDBACK_ATTACHMENTS).optional(),
});

export const CreateFeedbackCommentSchema = z.object({
  body: z.string().min(1).max(MAX_FEEDBACK_COMMENT_LENGTH),
});

export const UpdateFeedbackStatusSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES as unknown as [string, ...string[]]),
});

export type FeedbackListQuery = {
  page: number;
  limit: number;
  sort: FeedbackSortOption;
  category?: FeedbackCategory;
  status?: FeedbackStatus;
  hasStaffResponse?: boolean;
  search?: string;
};

export function parseFeedbackListQuery(searchParams: URLSearchParams): FeedbackListQuery {
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit')) || 20));
  const sortParam = searchParams.get('sort') ?? 'newest';
  const sort: FeedbackSortOption = isFeedbackSortOption(sortParam) ? sortParam : 'newest';

  const categoryParam = searchParams.get('category');
  const category = categoryParam && isFeedbackCategory(categoryParam) ? categoryParam : undefined;

  const statusParam = searchParams.get('status');
  const status = statusParam && isFeedbackStatus(statusParam) ? statusParam : undefined;

  const hasStaffResponseParam = searchParams.get('hasStaffResponse');
  const hasStaffResponse =
    hasStaffResponseParam === 'true'
      ? true
      : hasStaffResponseParam === 'false'
        ? false
        : undefined;

  const rawSearch = searchParams.get('search');
  const search = rawSearch && rawSearch.length <= 200 ? rawSearch.trim() : undefined;

  return { page, limit, sort, category, status, hasStaffResponse, search };
}

function mapServiceError(errorCode: string, error: string): FeedbackResult<never> {
  switch (errorCode) {
    case 'RATE_LIMITED':
      return { ok: false, kind: 'rate_limited' };
    case 'NOT_FOUND':
      return { ok: false, kind: 'not_found', message: error };
    case 'FORBIDDEN':
      return { ok: false, kind: 'forbidden', message: error };
    case 'ALREADY_UPVOTED':
    case 'NOT_UPVOTED':
      return { ok: false, kind: 'conflict', message: error };
    default:
      return { ok: false, kind: 'bad_request', message: error };
  }
}

async function toPublicPost(
  post: FeedbackPostDocument,
  hasUpvoted: boolean,
  authorMap: Map<string, { displayName: string; username: string; avatarUrl?: string }>,
) {
  const authorId = post.identityId.toHexString();
  const authorProfile = authorMap.get(authorId);
  const attachments = await buildAttachmentList(post.attachmentMediaIds, post.attachmentUrls);

  return {
    id: post._id.toHexString(),
    postId: post.postId,
    author: {
      identityId: authorId,
      displayName: authorProfile?.displayName ?? 'Unknown',
      username: authorProfile?.username ?? '',
      avatarUrl: authorProfile?.avatarUrl,
    },
    title: post.title,
    description: post.description,
    category: post.category,
    status: post.status,
    attachmentMediaIds: post.attachmentMediaIds,
    attachments,
    upvoteCount: post.upvoteCount,
    commentCount: post.commentCount,
    hasStaffResponse: post.hasStaffResponse,
    hasUpvoted,
    statusChangedAt: post.statusChangedAt?.toISOString(),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

function toPublicComment(
  comment: FeedbackCommentDocument,
  authorMap: Map<string, { displayName: string; username: string; avatarUrl?: string }>,
) {
  const authorId = comment.identityId.toHexString();
  const authorProfile = authorMap.get(authorId);

  return {
    id: comment._id.toHexString(),
    postId: comment.postId,
    author: {
      identityId: authorId,
      displayName: authorProfile?.displayName ?? 'Unknown',
      username: authorProfile?.username ?? '',
      avatarUrl: authorProfile?.avatarUrl,
    },
    body: comment.body,
    responseLabel: comment.responseLabel,
    createdAt: comment.createdAt.toISOString(),
  };
}

export async function createPostResult(
  ctx: IdentityContext,
  body: unknown,
): Promise<FeedbackResult<{ postId: string }>> {
  const parsed = CreateFeedbackPostSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const result = await createFeedbackPost(ctx.identity._id.toHexString(), parsed.data);
  if (!result.success) {
    return mapServiceError(result.errorCode, result.error);
  }

  return { ok: true, data: result.data };
}

export async function listPostsResult(
  ctx: IdentityContext | null,
  searchParams: URLSearchParams,
): Promise<
  FeedbackResult<{
    items: Awaited<ReturnType<typeof toPublicPost>>[];
    total: number;
    page: number;
    limit: number;
  }>
> {
  const query = parseFeedbackListQuery(searchParams);
  const viewerIdentityId = ctx?.identity._id.toHexString();
  const result = await listFeedbackPosts(query, viewerIdentityId);
  if (!result.success) {
    return mapServiceError(result.errorCode, result.error);
  }

  const authorIds = result.data.posts.map((p) => p.identityId.toHexString());
  const authorMap = await resolveFeedbackAuthors(authorIds);

  const items = await Promise.all(
    result.data.posts.map((post) =>
      toPublicPost(post, result.data.votedPostIds.has(post.postId), authorMap),
    ),
  );

  return {
    ok: true,
    data: {
      items,
      total: result.data.total,
      page: query.page,
      limit: query.limit,
    },
  };
}

export async function getPostResult(
  ctx: IdentityContext | null,
  postId: string,
): Promise<
  FeedbackResult<{
    post: Awaited<ReturnType<typeof toPublicPost>>;
    comments: ReturnType<typeof toPublicComment>[];
    canManageStatus: boolean;
  }>
> {
  const viewerIdentityId = ctx?.identity._id.toHexString();
  const result = await getFeedbackPostDetail(
    postId,
    viewerIdentityId,
    ctx?.entitlements ?? [],
  );
  if (!result.success) {
    return mapServiceError(result.errorCode, result.error);
  }

  const authorIds = [
    result.data.post.identityId.toHexString(),
    ...result.data.comments.map((c) => c.identityId.toHexString()),
  ];
  const authorMap = await resolveFeedbackAuthors(authorIds);

  const post = await toPublicPost(result.data.post, result.data.hasUpvoted, authorMap);
  const comments = result.data.comments.map((c) => toPublicComment(c, authorMap));

  return {
    ok: true,
    data: {
      post,
      comments,
      canManageStatus: result.data.canManageStatus,
    },
  };
}

export async function upvotePostResult(
  ctx: IdentityContext,
  postId: string,
): Promise<FeedbackResult<{ upvoteCount: number; hasUpvoted: boolean }>> {
  const result = await upvoteFeedbackPost(postId, ctx.identity._id.toHexString());
  if (!result.success) {
    return mapServiceError(result.errorCode, result.error);
  }
  return { ok: true, data: result.data };
}

export async function removeUpvoteResult(
  ctx: IdentityContext,
  postId: string,
): Promise<FeedbackResult<{ upvoteCount: number; hasUpvoted: boolean }>> {
  const result = await removeFeedbackUpvote(postId, ctx.identity._id.toHexString());
  if (!result.success) {
    return mapServiceError(result.errorCode, result.error);
  }
  return { ok: true, data: result.data };
}

export async function addCommentResult(
  ctx: IdentityContext,
  postId: string,
  body: unknown,
): Promise<FeedbackResult<ReturnType<typeof toPublicComment>>> {
  const parsed = CreateFeedbackCommentSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const result = await addFeedbackComment(
    postId,
    ctx.identity,
    parsed.data.body,
    ctx.entitlements,
  );
  if (!result.success) {
    return mapServiceError(result.errorCode, result.error);
  }

  const authorMap = await resolveFeedbackAuthors([ctx.identity._id.toHexString()]);
  return { ok: true, data: toPublicComment(result.data, authorMap) };
}

export async function updateStatusResult(
  ctx: IdentityContext,
  postId: string,
  body: unknown,
): Promise<FeedbackResult<void>> {
  const parsed = UpdateFeedbackStatusSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const result = await updateFeedbackStatus(
    postId,
    ctx.identity,
    parsed.data.status,
    ctx.entitlements,
  );
  if (!result.success) {
    return mapServiceError(result.errorCode, result.error);
  }

  return { ok: true, data: undefined };
}

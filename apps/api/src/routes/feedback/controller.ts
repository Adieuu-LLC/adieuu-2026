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
  FEEDBACK_LIST_PAGE_SIZE,
  FEEDBACK_LIST_PAGE_SIZE_MAX,
  excerptFeedbackComment,
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
import { getFeedbackCommentRepository } from '../../repositories/feedback-comment.repository';
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
  isOfficial: z.boolean().optional(),
});

export const CreateFeedbackCommentSchema = z.object({
  body: z.string().min(1).max(MAX_FEEDBACK_COMMENT_LENGTH),
  parentCommentId: z.string().min(1).max(200).optional(),
});

export const UpdateFeedbackStatusSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES as unknown as [string, ...string[]]),
});

export type FeedbackListQuery = {
  page: number;
  limit: number;
  sort: FeedbackSortOption;
  category?: FeedbackCategory;
  statuses?: FeedbackStatus[];
  hasStaffResponse?: boolean;
  isOfficial?: boolean;
  search?: string;
};

function parseStatusesParam(raw: string | null): FeedbackStatus[] | undefined {
  if (!raw) return undefined;
  const statuses = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is FeedbackStatus => isFeedbackStatus(value));
  return statuses.length > 0 ? statuses : [];
}

export function parseFeedbackListQuery(searchParams: URLSearchParams): FeedbackListQuery {
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(
    FEEDBACK_LIST_PAGE_SIZE_MAX,
    Math.max(1, Number(searchParams.get('limit')) || FEEDBACK_LIST_PAGE_SIZE),
  );
  const sortParam = searchParams.get('sort') ?? 'upvotes';
  const sort: FeedbackSortOption = isFeedbackSortOption(sortParam) ? sortParam : 'upvotes';

  const categoryParam = searchParams.get('category');
  const category = categoryParam && isFeedbackCategory(categoryParam) ? categoryParam : undefined;

  const statuses = parseStatusesParam(searchParams.get('statuses'));

  const hasStaffResponseParam = searchParams.get('hasStaffResponse');
  const hasStaffResponse =
    hasStaffResponseParam === 'true'
      ? true
      : hasStaffResponseParam === 'false'
        ? false
        : undefined;

  const isOfficialParam = searchParams.get('isOfficial');
  const isOfficial =
    isOfficialParam === 'true' ? true : isOfficialParam === 'false' ? false : undefined;

  const rawSearch = searchParams.get('search');
  const search = rawSearch && rawSearch.length <= 200 ? rawSearch.trim() : undefined;

  return { page, limit, sort, category, statuses, hasStaffResponse, isOfficial, search };
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
    case 'INVALID_PARENT':
      return { ok: false, kind: 'bad_request', message: error };
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
    isOfficial: post.isOfficial ?? false,
    hasUpvoted,
    statusChangedAt: post.statusChangedAt?.toISOString(),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

function buildCommentParentMap(
  comments: FeedbackCommentDocument[],
): Map<string, FeedbackCommentDocument> {
  return new Map(comments.map((comment) => [comment._id.toHexString(), comment]));
}

function collectCommentAuthorIds(
  postAuthorId: string,
  comments: FeedbackCommentDocument[],
  parentById: Map<string, FeedbackCommentDocument>,
): string[] {
  const authorIds = new Set<string>([postAuthorId]);
  for (const comment of comments) {
    authorIds.add(comment.identityId.toHexString());
    if (comment.parentCommentId) {
      const parent = parentById.get(comment.parentCommentId);
      if (parent) {
        authorIds.add(parent.identityId.toHexString());
      }
    }
  }
  return [...authorIds];
}

function toPublicComment(
  comment: FeedbackCommentDocument,
  authorMap: Map<string, { displayName: string; username: string; avatarUrl?: string }>,
  parent?: FeedbackCommentDocument | null,
) {
  const authorId = comment.identityId.toHexString();
  const authorProfile = authorMap.get(authorId);
  const parentCommentId = comment.parentCommentId ?? null;

  let parentPreview = null;
  if (parentCommentId && parent) {
    const parentAuthorId = parent.identityId.toHexString();
    const parentAuthor = authorMap.get(parentAuthorId);
    parentPreview = {
      commentId: parent._id.toHexString(),
      authorDisplayName: parentAuthor?.displayName ?? 'Unknown',
      bodyExcerpt: excerptFeedbackComment(parent.body),
    };
  }

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
    parentCommentId,
    parentPreview,
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

  const result = await createFeedbackPost(ctx.identity, parsed.data);
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

  const parentById = buildCommentParentMap(result.data.comments);
  const authorMap = await resolveFeedbackAuthors(
    collectCommentAuthorIds(
      result.data.post.identityId.toHexString(),
      result.data.comments,
      parentById,
    ),
  );

  const post = await toPublicPost(result.data.post, result.data.hasUpvoted, authorMap);
  const comments = result.data.comments.map((comment) => {
    const parent = comment.parentCommentId
      ? parentById.get(comment.parentCommentId) ?? null
      : null;
    return toPublicComment(comment, authorMap, parent);
  });

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
    parsed.data.parentCommentId,
  );
  if (!result.success) {
    return mapServiceError(result.errorCode, result.error);
  }

  const commentRepo = getFeedbackCommentRepository();
  const parent = result.data.parentCommentId
    ? await commentRepo.findByCommentId(result.data.parentCommentId)
    : null;

  const authorIds = [ctx.identity._id.toHexString()];
  if (parent) {
    authorIds.push(parent.identityId.toHexString());
  }
  const authorMap = await resolveFeedbackAuthors(authorIds);
  return { ok: true, data: toPublicComment(result.data, authorMap, parent) };
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

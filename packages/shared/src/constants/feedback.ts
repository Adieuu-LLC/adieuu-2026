/**
 * Community feedback board constants.
 * Shared between API validation and UI localization keys.
 */

export const FEEDBACK_CATEGORIES = [
  'feature',
  'improvement',
  'bug',
  'other',
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = [
  'submitted',
  'planned',
  'roadmapped',
  'in_progress',
  'internal_testing',
  'public_testing',
  'released',
] as const;

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_SORT_OPTIONS = ['newest', 'oldest', 'upvotes'] as const;

export type FeedbackSortOption = (typeof FEEDBACK_SORT_OPTIONS)[number];

export const FEEDBACK_RESPONSE_LABELS = ['dev_response', 'staff_response'] as const;

export type FeedbackResponseLabel = (typeof FEEDBACK_RESPONSE_LABELS)[number];

export const FEEDBACK_LINK_TYPES = ['duplicate', 'related', 'complementary'] as const;

export type FeedbackLinkType = (typeof FEEDBACK_LINK_TYPES)[number];

export const FEEDBACK_LINK_DIRECTIONS = ['outbound', 'inbound'] as const;

export type FeedbackLinkDirection = (typeof FEEDBACK_LINK_DIRECTIONS)[number];

export const MAX_FEEDBACK_TITLE_LENGTH = 200;
export const MAX_FEEDBACK_BODY_LENGTH = 5000;
export const MAX_FEEDBACK_ATTACHMENTS = 3;
export const MAX_FEEDBACK_POSTS_PER_DAY = 10;
export const MAX_FEEDBACK_COMMENT_LENGTH = 2000;
export const MAX_FEEDBACK_COMMENT_REPLY_PREVIEW_LENGTH = 200;
export const FEEDBACK_LIST_PAGE_SIZE = 15;
export const FEEDBACK_LIST_PAGE_SIZE_MAX = 50;
export const FEEDBACK_LIST_DEFAULT_SORT: FeedbackSortOption = 'upvotes';

export function getFeedbackListDefaultStatuses(): FeedbackStatus[] {
  return FEEDBACK_STATUSES.filter((status) => status !== 'released');
}

export function excerptFeedbackComment(
  body: string,
  maxLength = MAX_FEEDBACK_COMMENT_REPLY_PREVIEW_LENGTH,
): string {
  if (body.length <= maxLength) return body;
  return `${body.slice(0, maxLength)}…`;
}

export function isFeedbackCategory(value: string): value is FeedbackCategory {
  return (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

export function isFeedbackStatus(value: string): value is FeedbackStatus {
  return (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

export function isFeedbackSortOption(value: string): value is FeedbackSortOption {
  return (FEEDBACK_SORT_OPTIONS as readonly string[]).includes(value);
}

export function isFeedbackLinkType(value: string): value is FeedbackLinkType {
  return (FEEDBACK_LINK_TYPES as readonly string[]).includes(value);
}

const FEEDBACK_LINK_BODY_PHRASES: Record<FeedbackLinkType, string> = {
  duplicate: 'is a duplicate of',
  related: 'seems related to',
  complementary: 'would go well with',
};

export function buildFeedbackLinkCommentBody(
  linkType: FeedbackLinkType,
  linkedPostTitle: string,
): string {
  return `suggested this post ${FEEDBACK_LINK_BODY_PHRASES[linkType]} ${linkedPostTitle}`;
}

const FEEDBACK_RECIPROCAL_LINK_BODY_PHRASES: Record<FeedbackLinkType, string> = {
  duplicate: 'is a duplicate of this post',
  related: 'seems related to this post',
  complementary: 'would go well with this post',
};

export function buildFeedbackReciprocalLinkCommentBody(
  linkType: FeedbackLinkType,
  sourcePostTitle: string,
): string {
  return `suggested ${sourcePostTitle} ${FEEDBACK_RECIPROCAL_LINK_BODY_PHRASES[linkType]}`;
}

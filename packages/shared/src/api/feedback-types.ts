import type {
  FeedbackCategory,
  FeedbackResponseLabel,
  FeedbackSortOption,
  FeedbackStatus,
} from '../constants/feedback';

export interface FeedbackAuthor {
  identityId: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
}

export interface FeedbackAttachment {
  mediaId: string;
  cdnUrl: string;
  contentType: string;
}

export interface PublicFeedbackPost {
  id: string;
  postId: string;
  author: FeedbackAuthor;
  title: string;
  description: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  attachmentMediaIds: string[];
  attachments: FeedbackAttachment[];
  upvoteCount: number;
  commentCount: number;
  hasStaffResponse: boolean;
  isOfficial: boolean;
  hasUpvoted: boolean;
  statusChangedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackCommentParentPreview {
  commentId: string;
  authorDisplayName: string;
  bodyExcerpt: string;
}

export interface PublicFeedbackComment {
  id: string;
  postId: string;
  author: FeedbackAuthor;
  body: string;
  responseLabel: FeedbackResponseLabel | null;
  parentCommentId: string | null;
  parentPreview: FeedbackCommentParentPreview | null;
  createdAt: string;
}

export interface CreateFeedbackPostParams {
  title: string;
  description: string;
  category: FeedbackCategory;
  attachmentMediaIds?: string[];
  isOfficial?: boolean;
}

export interface CreateFeedbackCommentParams {
  body: string;
  parentCommentId?: string;
}

export interface FeedbackListParams {
  page?: number;
  limit?: number;
  sort?: FeedbackSortOption;
  category?: FeedbackCategory;
  statuses?: FeedbackStatus[];
  hasStaffResponse?: boolean;
  isOfficial?: boolean;
  search?: string;
}

export interface FeedbackListResponse {
  items: PublicFeedbackPost[];
  total: number;
  page: number;
  limit: number;
}

export interface FeedbackDetailResponse {
  post: PublicFeedbackPost;
  comments: PublicFeedbackComment[];
  canManageStatus: boolean;
}

export interface UpdateFeedbackStatusParams {
  status: FeedbackStatus;
}

export interface CreateFeedbackPostResponse {
  postId: string;
}

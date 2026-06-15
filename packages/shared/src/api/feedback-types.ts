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
  hasUpvoted: boolean;
  statusChangedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicFeedbackComment {
  id: string;
  postId: string;
  author: FeedbackAuthor;
  body: string;
  responseLabel: FeedbackResponseLabel | null;
  createdAt: string;
}

export interface CreateFeedbackPostParams {
  title: string;
  description: string;
  category: FeedbackCategory;
  attachmentMediaIds?: string[];
}

export interface CreateFeedbackCommentParams {
  body: string;
}

export interface FeedbackListParams {
  page?: number;
  limit?: number;
  sort?: FeedbackSortOption;
  category?: FeedbackCategory;
  status?: FeedbackStatus;
  hasStaffResponse?: boolean;
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

import type {
  FeedbackCategory,
  FeedbackLinkDirection,
  FeedbackLinkType,
  FeedbackResponseLabel,
  FeedbackSortOption,
  FeedbackStatus,
} from '../constants/feedback';
import type { RoadmapTimelineGroup, RoadmapTimelineResponse } from '../feedback/roadmap-timeline';

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
  isRoadmapOfficial: boolean;
  isStaffAuthored: boolean;
  hasUpvoted: boolean;
  targetReleaseDate?: string;
  releasedAt?: string;
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
  linkedPostId: string | null;
  linkType: FeedbackLinkType | null;
  linkDirection: FeedbackLinkDirection | null;
  linkedPostTitle: string | null;
  createdAt: string;
}

export interface RelatedFeedbackPost {
  postId: string;
  title: string;
  linkType: FeedbackLinkType;
  suggestedBy: FeedbackAuthor;
}

export interface CreateFeedbackPostParams {
  title: string;
  description: string;
  category: FeedbackCategory;
  attachmentMediaIds?: string[];
  isRoadmapOfficial?: boolean;
  targetReleaseDate?: string;
  status?: FeedbackStatus;
}

export type CreateFeedbackTextCommentParams = {
  body: string;
  parentCommentId?: string;
};

export type CreateFeedbackLinkCommentParams = {
  linkedPostId: string;
  linkType: FeedbackLinkType;
  parentCommentId?: string;
};

export type CreateFeedbackCommentParams =
  | CreateFeedbackTextCommentParams
  | CreateFeedbackLinkCommentParams;

export interface FeedbackListParams {
  page?: number;
  limit?: number;
  sort?: FeedbackSortOption;
  category?: FeedbackCategory;
  statuses?: FeedbackStatus[];
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
  relatedPosts: RelatedFeedbackPost[];
  canManageStatus: boolean;
}

export interface UpdateFeedbackStatusParams {
  status: FeedbackStatus;
}

export interface CreateFeedbackPostResponse {
  postId: string;
}

export interface FeedbackNotificationPrefs {
  notifyPostReplies: boolean;
  notifyCommentReplies: boolean;
}

export interface UpdateFeedbackNotificationPrefsParams {
  notifyPostReplies?: boolean;
  notifyCommentReplies?: boolean;
}

export interface FeedbackUnreadSummary {
  postReplies: number;
  commentReplies: number;
}

export type RoadmapTimelineGroupResponse = RoadmapTimelineGroup<PublicFeedbackPost>;
export type RoadmapTimelineResponseData = RoadmapTimelineResponse<PublicFeedbackPost>;

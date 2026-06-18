import type { ApiResponse } from '../types';
import type { HttpClient, RequestOptions } from './http-client';
import type {
  CreateFeedbackCommentParams,
  CreateFeedbackPostParams,
  CreateFeedbackPostResponse,
  FeedbackDetailResponse,
  FeedbackListParams,
  FeedbackListResponse,
  FeedbackNotificationPrefs,
  PublicFeedbackComment,
  RoadmapTimelineResponseData,
  UpdateFeedbackNotificationPrefsParams,
  UpdateFeedbackStatusParams,
} from './feedback-types';

export class FeedbackApi {
  constructor(private client: HttpClient) {}

  async createPost(
    params: CreateFeedbackPostParams,
  ): Promise<ApiResponse<CreateFeedbackPostResponse>> {
    return this.client.post('/api/feedback', params);
  }

  async listPosts(
    params?: FeedbackListParams,
    requestOptions?: RequestOptions,
  ): Promise<ApiResponse<FeedbackListResponse>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.category) qs.set('category', params.category);
    if (params?.statuses?.length) qs.set('statuses', params.statuses.join(','));
    if (params?.hasStaffResponse !== undefined) {
      qs.set('hasStaffResponse', String(params.hasStaffResponse));
    }
    if (params?.search) qs.set('search', params.search);
    const query = qs.toString();
    return this.client.get(`/api/feedback${query ? `?${query}` : ''}`, requestOptions);
  }

  async getRoadmapTimeline(
    requestOptions?: RequestOptions,
  ): Promise<ApiResponse<RoadmapTimelineResponseData>> {
    return this.client.get('/api/feedback/roadmap', requestOptions);
  }

  async getPost(postId: string): Promise<ApiResponse<FeedbackDetailResponse>> {
    return this.client.get(`/api/feedback/${encodeURIComponent(postId)}`);
  }

  async upvotePost(postId: string): Promise<ApiResponse<{ upvoteCount: number; hasUpvoted: boolean }>> {
    return this.client.post(`/api/feedback/${encodeURIComponent(postId)}/upvote`, {});
  }

  async removeUpvote(postId: string): Promise<ApiResponse<{ upvoteCount: number; hasUpvoted: boolean }>> {
    return this.client.delete(`/api/feedback/${encodeURIComponent(postId)}/upvote`);
  }

  async addComment(
    postId: string,
    params: CreateFeedbackCommentParams,
  ): Promise<ApiResponse<PublicFeedbackComment>> {
    return this.client.post(
      `/api/feedback/${encodeURIComponent(postId)}/comments`,
      params,
    );
  }

  async updateStatus(
    postId: string,
    params: UpdateFeedbackStatusParams,
  ): Promise<ApiResponse<void>> {
    return this.client.patch(
      `/api/feedback/${encodeURIComponent(postId)}/status`,
      params,
    );
  }

  async getNotificationPrefs(): Promise<ApiResponse<FeedbackNotificationPrefs>> {
    return this.client.get('/api/feedback/notification-prefs');
  }

  async updateNotificationPrefs(
    params: UpdateFeedbackNotificationPrefsParams,
  ): Promise<ApiResponse<FeedbackNotificationPrefs>> {
    return this.client.put('/api/feedback/notification-prefs', params);
  }
}

import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { ReportCategory } from './moderation-types';

export interface SubmitMessageReportParams {
  type: 'message';
  targetMessageId: string;
  category: ReportCategory;
  reason?: string;
  /** Map of messageId -> base64-encoded per-message session key */
  sessionKeys: Record<string, string>;
}

export interface SubmitProfileReportParams {
  type: 'profile';
  targetIdentityId: string;
  category: ReportCategory;
  reason?: string;
}

export interface SubmitReportResponse {
  reportId: string;
}

export class ReportsApi {
  constructor(private client: HttpClient) {}

  async submitMessageReport(params: SubmitMessageReportParams): Promise<ApiResponse<SubmitReportResponse>> {
    return this.client.post('/api/reports', params);
  }

  async submitProfileReport(params: SubmitProfileReportParams): Promise<ApiResponse<SubmitReportResponse>> {
    return this.client.post('/api/reports', params);
  }
}

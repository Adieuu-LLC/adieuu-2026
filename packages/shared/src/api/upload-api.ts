import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';

export type UploadPurpose = 'avatar' | 'banner' | 'dm_attachment' | 'space_media' | 'conv_media' | 'conv_scan' | 'custom_emoji' | 'ticket_attachment' | 'feedback_attachment';

export type UploadStatus = 'pending' | 'uploaded' | 'processing' | 'ready' | 'rejected' | 'failed';

export type E2EMediaStatus = 'pending' | 'uploaded' | 'gated' | 'available';

export interface RequestUploadParams {
  purpose: UploadPurpose;
  contentType: string;
  contentLength: number;
  /** Required when purpose is `space_media` — binds the upload to a Space. */
  spaceId?: string;
}

export interface RequestUploadResponse {
  mediaId: string;
  uploadUrl: string;
  expiresIn: number;
  /** Form fields the client must include in the POST body (presigned POST policy). Absent when uploadHeaders is set. */
  uploadFields?: Record<string, string>;
  /** Headers the client must include in the PUT request (CloudFront signed URL mode). When present, use PUT instead of POST. */
  uploadHeaders?: Record<string, string>;
}

export interface UploadStatusResponse {
  mediaId: string;
  status: UploadStatus;
  cdnUrl: string | null;
  rejectionReason: string | null;
}

export class UploadApi {
  constructor(private client: HttpClient) {}

  /**
   * Request a presigned S3 POST URL with form fields.
   */
  async requestUpload(
    params: RequestUploadParams
  ): Promise<ApiResponse<RequestUploadResponse>> {
    return this.client.post('/api/uploads/request', params);
  }

  /**
   * Notify the server that a file upload is complete.
   */
  async completeUpload(mediaId: string): Promise<ApiResponse<void>> {
    return this.client.post(
      `/api/uploads/${encodeURIComponent(mediaId)}/complete`,
      {}
    );
  }

  /**
   * Check the processing status of an upload.
   */
  async getStatus(
    mediaId: string
  ): Promise<ApiResponse<UploadStatusResponse>> {
    return this.client.get(
      `/api/uploads/${encodeURIComponent(mediaId)}/status`
    );
  }
}

import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';

export type UploadPurpose = 'avatar' | 'banner' | 'dm_attachment' | 'space_media' | 'conv_media' | 'conv_scan';

export type UploadStatus = 'pending' | 'uploaded' | 'processing' | 'ready' | 'rejected' | 'failed';

export type E2EMediaStatus = 'pending' | 'uploaded' | 'gated' | 'available';

export interface RequestUploadParams {
  purpose: UploadPurpose;
  contentType: string;
  contentLength: number;
}

export interface RequestUploadResponse {
  mediaId: string;
  uploadUrl: string;
  expiresIn: number;
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
   * Request a presigned S3 upload URL.
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

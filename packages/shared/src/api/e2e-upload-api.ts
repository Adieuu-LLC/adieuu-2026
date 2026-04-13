import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { E2EMediaStatus } from './upload-api';

export interface RequestE2EUploadParams {
  contentType: string;
  contentLength: number;
  stripExif?: boolean;
}

export interface RequestE2EUploadResponse {
  e2eMediaId: string;
  uploadUrl: string;
  scanHash: string;
  expiresIn: number;
}

export interface RequestScanUploadParams {
  scanHash: string;
  contentType: string;
  contentLength: number;
}

export interface RequestScanUploadResponse {
  scanMediaId: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface E2EMediaStatusResponse {
  e2eMediaId: string;
  status: E2EMediaStatus;
  moderationStatus: string;
  moderationReason: string | null;
}

export interface E2EMediaDownloadResponse {
  downloadUrl: string;
  expiresIn: number;
}

export class E2EUploadApi {
  constructor(private client: HttpClient) {}

  async requestE2EUpload(
    params: RequestE2EUploadParams
  ): Promise<ApiResponse<RequestE2EUploadResponse>> {
    return this.client.post('/api/uploads/e2e/request', params);
  }

  async completeE2EUpload(e2eMediaId: string): Promise<ApiResponse<void>> {
    return this.client.post(
      `/api/uploads/e2e/${encodeURIComponent(e2eMediaId)}/complete`,
      {}
    );
  }

  async getE2EMediaStatus(
    e2eMediaId: string
  ): Promise<ApiResponse<E2EMediaStatusResponse>> {
    return this.client.get(
      `/api/uploads/e2e/${encodeURIComponent(e2eMediaId)}/status`
    );
  }

  async getE2EMediaDownload(
    e2eMediaId: string
  ): Promise<ApiResponse<E2EMediaDownloadResponse>> {
    return this.client.get(
      `/api/uploads/e2e/${encodeURIComponent(e2eMediaId)}/download`
    );
  }

  async requestScanUpload(
    params: RequestScanUploadParams
  ): Promise<ApiResponse<RequestScanUploadResponse>> {
    return this.client.post('/api/uploads/scan/request', params);
  }

  async completeScanUpload(scanMediaId: string): Promise<ApiResponse<void>> {
    return this.client.post(
      `/api/uploads/scan/${encodeURIComponent(scanMediaId)}/complete`,
      {}
    );
  }
}

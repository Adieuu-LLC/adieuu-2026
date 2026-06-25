import type { ApiResponse, ConvScanSealManifestV1 } from '../types';
import type { HttpClient, RequestOptions } from './http-client';
import type { E2EMediaStatus } from './upload-api';

export interface RequestE2EUploadParams {
  contentType: string;
  contentLength: number;
  stripExif?: boolean;
  /** Required for video/* — duration in seconds from client metadata (enforced vs session limit). */
  declaredDurationSeconds?: number;
}

export interface RequestE2EUploadResponse {
  e2eMediaId: string;
  uploadUrl: string;
  scanHash: string;
  expiresIn: number;
  /** Headers the client must include in the PUT request (forwarded through CloudFront to S3). */
  uploadHeaders?: Record<string, string>;
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
  /** Headers the client must include in the PUT request (forwarded through CloudFront to S3). */
  uploadHeaders?: Record<string, string>;
}

export interface SealConvScanSessionParams {
  scanHash: string;
  /** When set, must include every uploaded part mediaId for this scan session. */
  scanMediaIds?: string[];
  /** Optional; validated server-side and stored as `manifest.json` under the scan prefix. */
  manifest?: ConvScanSealManifestV1;
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
    params: RequestE2EUploadParams,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<RequestE2EUploadResponse>> {
    return this.client.post('/api/uploads/e2e/request', params, requestOptions);
  }

  async completeE2EUpload(
    e2eMediaId: string,
    requestOptions?: RequestOptions,
    options?: { skipModeration?: boolean }
  ): Promise<ApiResponse<void>> {
    return this.client.post(
      `/api/uploads/e2e/${encodeURIComponent(e2eMediaId)}/complete`,
      options?.skipModeration ? { skipModeration: true } : {},
      requestOptions
    );
  }

  async abandonE2EUpload(
    e2eMediaId: string,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/uploads/e2e/${encodeURIComponent(e2eMediaId)}`,
      requestOptions
    );
  }

  async getE2EMediaStatus(
    e2eMediaId: string,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<E2EMediaStatusResponse>> {
    return this.client.get(
      `/api/uploads/e2e/${encodeURIComponent(e2eMediaId)}/status`,
      requestOptions
    );
  }

  async getE2EMediaDownload(
    e2eMediaId: string,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<E2EMediaDownloadResponse>> {
    return this.client.get(
      `/api/uploads/e2e/${encodeURIComponent(e2eMediaId)}/download`,
      requestOptions
    );
  }

  async requestScanUpload(
    params: RequestScanUploadParams,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<RequestScanUploadResponse>> {
    return this.client.post('/api/uploads/scan/request', params, requestOptions);
  }

  async completeScanUpload(
    scanMediaId: string,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<void>> {
    return this.client.post(
      `/api/uploads/scan/${encodeURIComponent(scanMediaId)}/complete`,
      {},
      requestOptions
    );
  }

  async sealConvScanSession(
    params: SealConvScanSessionParams,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<void>> {
    return this.client.post('/api/uploads/scan/seal', params, requestOptions);
  }
}

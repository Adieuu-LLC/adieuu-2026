import { createApiClient } from '@adieuu/shared';
import { generateThumbnail, getImageDimensions } from '../utils/imageProcessing';
import { generateVideoFrameThumbnail, getVideoDimensions } from '../utils/videoProcessing';

export interface MediaUploadResult {
  e2eMediaId: string;
  scanHash: string;
  contentType: string;
  fileName?: string;
  width: number;
  height: number;
  sizeBytes: number;
  exifPreserved: boolean;
}

/** E2E phase result plus the JPEG thumbnail used for the anonymised scan copy (upload separately). */
export type ConversationE2EUploadResult = MediaUploadResult & { scanThumbnail: Blob };

export type UploadMediaFileOptions = {
  stripExif?: boolean;
  signal?: AbortSignal;
  /** Called after E2E blob is stored and completeE2EUpload succeeds. */
  onUploadsComplete?: () => void;
};

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

async function buildDimensionsAndScanThumbnail(file: File): Promise<{
  dimensions: { width: number; height: number };
  thumbnail: Blob;
}> {
  const [dimensions, thumbnail] = await Promise.all([
    isVideoFile(file) ? getVideoDimensions(file) : getImageDimensions(file),
    isVideoFile(file) ? generateVideoFrameThumbnail(file) : generateThumbnail(file),
  ]);
  return { dimensions, thumbnail };
}

/**
 * Upload encrypted blob to E2E storage and finalise — **does not** upload the scan copy.
 * Use {@link uploadModerationScanCopy} after the message is sent so sending is not blocked on scan PUT/Lambda.
 */
export async function uploadE2EMediaOnly(
  api: ReturnType<typeof createApiClient>,
  file: File,
  encryptedBlob: Blob,
  options?: UploadMediaFileOptions
): Promise<ConversationE2EUploadResult> {
  const signal = options?.signal;
  const stripExif = options?.stripExif ?? true;
  const onUploadsComplete = options?.onUploadsComplete;

  const { dimensions, thumbnail } = await buildDimensionsAndScanThumbnail(file);

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const effectiveStripExif = isVideoFile(file) ? false : stripExif;

  const e2eRes = await api.e2eUploads.requestE2EUpload({
    contentType: file.type,
    contentLength: encryptedBlob.size,
    stripExif: effectiveStripExif,
  });
  if (!e2eRes.success || !e2eRes.data) {
    throw new Error(
      (!e2eRes.success && 'error' in e2eRes ? e2eRes.error?.message : null) ??
        'Failed to prepare E2E upload'
    );
  }
  const { e2eMediaId: mediaId, uploadUrl: e2eUrl, scanHash: hash } = e2eRes.data;

  const e2ePut = await fetch(e2eUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: encryptedBlob,
    signal,
  });
  if (!e2ePut.ok) throw new Error(`E2E upload failed (${e2ePut.status})`);

  const e2eComplete = await api.e2eUploads.completeE2EUpload(mediaId);
  if (!e2eComplete.success) throw new Error('Failed to finalise E2E upload');

  onUploadsComplete?.();

  return {
    e2eMediaId: mediaId,
    scanHash: hash,
    contentType: file.type,
    fileName: file.name,
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: file.size,
    exifPreserved: isVideoFile(file) ? false : !stripExif,
    scanThumbnail: thumbnail,
  };
}

/**
 * Upload cleartext JPEG thumbnail for Rekognition; run after message send so it cannot delay send.
 */
export async function uploadModerationScanCopy(
  api: ReturnType<typeof createApiClient>,
  scanHash: string,
  scanThumbnail: Blob,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const signal = options?.signal;

  const scanRes = await api.e2eUploads.requestScanUpload({
    scanHash,
    contentType: 'image/jpeg',
    contentLength: scanThumbnail.size,
  });
  if (!scanRes.success || !scanRes.data) {
    throw new Error(
      (!scanRes.success && 'error' in scanRes ? scanRes.error?.message : null) ??
        'Failed to prepare scan upload'
    );
  }
  const { scanMediaId, uploadUrl: scanUrl } = scanRes.data;

  const scanPut = await fetch(scanUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: scanThumbnail,
    signal,
  });
  if (!scanPut.ok) throw new Error(`Scan upload failed (${scanPut.status})`);

  const scanComplete = await api.e2eUploads.completeScanUpload(scanMediaId);
  if (!scanComplete.success) throw new Error('Failed to finalise scan upload');
}

/**
 * Full pipeline: E2E + moderation scan copy (waits for both). Prefer {@link uploadE2EMediaOnly} +
 * {@link uploadModerationScanCopy} from the composer so send is not blocked on scan upload.
 */
export async function uploadMediaFile(
  api: ReturnType<typeof createApiClient>,
  file: File,
  encryptedBlob: Blob,
  options?: UploadMediaFileOptions
): Promise<MediaUploadResult> {
  const signal = options?.signal;
  const { scanThumbnail, ...rest } = await uploadE2EMediaOnly(api, file, encryptedBlob, {
    ...options,
    onUploadsComplete: undefined,
  });
  await uploadModerationScanCopy(api, rest.scanHash, scanThumbnail, { signal });
  options?.onUploadsComplete?.();
  return rest;
}

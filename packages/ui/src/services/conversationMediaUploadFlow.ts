import { createApiClient } from '@adieuu/shared';
import { generateThumbnail, getImageDimensions } from '../utils/imageProcessing';
import {
  getVideoDimensionsAndScanThumbnail,
  probeVideoPlayableInBrowser,
} from '../utils/videoProcessing';

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

/** Cleartext payload for the moderation scan upload (thumbnail JPEG or full MP4). */
export type ModerationScanPayload = {
  body: Blob;
  contentType: 'image/jpeg' | 'video/mp4';
};

/** E2E phase result plus scan assets for the moderation pipeline (upload scan copy separately). */
export type ConversationE2EUploadResult = MediaUploadResult & {
  scanThumbnail: Blob;
  moderationScan: ModerationScanPayload;
};

/**
 * Ensure video is MP4 (server accepts MP4 only) and the browser can decode it
 * for dimensions/thumbnails (H.264). HEVC-in-MP4 and other opaque MP4s are
 * re-encoded to H.264/AAC via ffmpeg.wasm.
 * Call with the same File you encrypt and pass to {@link uploadE2EMediaOnly}.
 */
export async function prepareConversationMediaFileForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('video/')) {
    return file;
  }
  const { transcodeVideoToMp4 } = await import('../utils/videoTranscode');
  if (file.type === 'video/mp4') {
    const playable = await probeVideoPlayableInBrowser(file);
    if (playable) return file;
    return transcodeVideoToMp4(file, { force: true });
  }
  return transcodeVideoToMp4(file);
}

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
  durationSeconds?: number;
}> {
  if (isVideoFile(file)) {
    const meta = await getVideoDimensionsAndScanThumbnail(file);
    return {
      dimensions: { width: meta.width, height: meta.height },
      thumbnail: meta.thumbnail,
      durationSeconds: meta.durationSeconds,
    };
  }

  const [dimensions, thumbnail] = await Promise.all([
    getImageDimensions(file),
    generateThumbnail(file),
  ]);
  return { dimensions, thumbnail };
}

/**
 * Upload encrypted blob to E2E storage and finalise — **does not** upload the scan copy.
 * Use {@link uploadModerationScanCopy} after the message is sent so sending is not blocked on scan PUT/Lambda.
 */
export async function uploadE2EMediaOnly(
  api: ReturnType<typeof createApiClient>,
  rawFile: File,
  encryptedBlob: Blob,
  options?: UploadMediaFileOptions
): Promise<ConversationE2EUploadResult> {
  const file = await prepareConversationMediaFileForUpload(rawFile);

  const signal = options?.signal;
  const stripExif = options?.stripExif ?? true;
  const onUploadsComplete = options?.onUploadsComplete;

  const { dimensions, thumbnail, durationSeconds } =
    await buildDimensionsAndScanThumbnail(file);

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const effectiveStripExif = isVideoFile(file) ? false : stripExif;

  const e2eRes = await api.e2eUploads.requestE2EUpload({
    contentType: file.type,
    contentLength: encryptedBlob.size,
    stripExif: effectiveStripExif,
    ...(durationSeconds !== undefined ? { declaredDurationSeconds: durationSeconds } : {}),
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

  const moderationScan: ModerationScanPayload = isVideoFile(file)
    ? { body: file, contentType: 'video/mp4' }
    : { body: thumbnail, contentType: 'image/jpeg' };

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
    moderationScan,
  };
}

/**
 * Upload cleartext scan copy for Rekognition (JPEG frame for images, full MP4 for video).
 * Run after message send so it cannot delay send.
 */
export async function uploadModerationScanCopy(
  api: ReturnType<typeof createApiClient>,
  scanHash: string,
  payload: ModerationScanPayload,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const signal = options?.signal;

  const scanRes = await api.e2eUploads.requestScanUpload({
    scanHash,
    contentType: payload.contentType,
    contentLength: payload.body.size,
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
    headers: { 'Content-Type': payload.contentType },
    body: payload.body,
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
  const { moderationScan, scanThumbnail: _scanThumb, ...rest } =
    await uploadE2EMediaOnly(api, file, encryptedBlob, {
      ...options,
      onUploadsComplete: undefined,
    });
  void _scanThumb;
  await uploadModerationScanCopy(api, rest.scanHash, moderationScan, { signal });
  options?.onUploadsComplete?.();
  return rest;
}

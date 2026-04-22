import { createApiClient, type ConvScanSealManifestV1 } from '@adieuu/shared';
import { generateThumbnail, getImageDimensions } from '../utils/imageProcessing';
import {
  getVideoDimensionsAndScanThumbnail,
  probeVideoPlayableInBrowser,
} from '../utils/videoProcessing';
import { sha256HexLower } from '../utils/blobDigest';
import { buildVideoModerationScanPayloads } from '../utils/videoModerationFrames';

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

/**
 * Cleartext payload for the moderation scan upload.
 * Images: thumbnail JPEG. Video: composite JPEG grid of sampled frames (image Rekognition path).
 */
export type ModerationScanPayload = {
  body: Blob;
  contentType: 'image/jpeg' | 'video/mp4';
};

/** E2E phase result plus scan assets for the moderation pipeline (upload scan copy separately). */
export type ConversationE2EUploadResult = MediaUploadResult & {
  scanThumbnail: Blob;
  /** One thumbnail/grid for images; one or more segment grids for long video. */
  moderationScan: ModerationScanPayload | ModerationScanPayload[];
};

/**
 * Ensure video is MP4 (server accepts MP4 only) and the browser can decode it
 * for dimensions/thumbnails (H.264). HEVC-in-MP4 and other opaque MP4s are
 * re-encoded to H.264/AAC via ffmpeg.wasm.
 * Call with the same File you encrypt and pass to {@link uploadE2EMediaOnly}.
 */
export async function prepareConversationMediaFileForUpload(
  file: File,
  options?: { signal?: AbortSignal }
): Promise<File> {
  const signal = options?.signal;
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  };

  if (!file.type.startsWith('video/')) {
    return file;
  }
  const { transcodeVideoToMp4 } = await import('../utils/videoTranscode');
  throwIfAborted();
  if (file.type === 'video/mp4') {
    const playable = await probeVideoPlayableInBrowser(file);
    throwIfAborted();
    if (playable) return file;
    return transcodeVideoToMp4(file, { force: true, signal });
  }
  return transcodeVideoToMp4(file, { signal });
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
  const signal = options?.signal;
  const file = await prepareConversationMediaFileForUpload(rawFile, { signal });
  const stripExif = options?.stripExif ?? true;
  const onUploadsComplete = options?.onUploadsComplete;

  const { dimensions, thumbnail, durationSeconds } =
    await buildDimensionsAndScanThumbnail(file);

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const effectiveStripExif = isVideoFile(file) ? false : stripExif;

  const e2eRes = await api.e2eUploads.requestE2EUpload(
    {
      contentType: file.type,
      contentLength: encryptedBlob.size,
      stripExif: effectiveStripExif,
      ...(durationSeconds !== undefined ? { declaredDurationSeconds: durationSeconds } : {}),
    },
    signal ? { signal } : undefined
  );
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

  const e2eComplete = await api.e2eUploads.completeE2EUpload(
    mediaId,
    signal ? { signal } : undefined
  );
  if (!e2eComplete.success) throw new Error('Failed to finalise E2E upload');

  onUploadsComplete?.();

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  let moderationScan: ModerationScanPayload | ModerationScanPayload[];
  if (isVideoFile(file)) {
    const payloads = await buildVideoModerationScanPayloads(file);
    moderationScan = payloads.length === 1 ? payloads[0]! : payloads;
  } else {
    moderationScan = { body: thumbnail, contentType: 'image/jpeg' };
  }

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
 * Upload cleartext scan copy for Rekognition (JPEG thumbnail for images, JPEG frame grid for video).
 * Pass multiple parts for a multi-part scan session; all parts are completed then the session is sealed.
 * Run after message send so it cannot delay send.
 */
export async function uploadModerationScanCopy(
  api: ReturnType<typeof createApiClient>,
  scanHash: string,
  payload: ModerationScanPayload | ModerationScanPayload[],
  options?: { signal?: AbortSignal }
): Promise<void> {
  const signal = options?.signal;
  const parts = Array.isArray(payload) ? payload : [payload];
  if (parts.length === 0) {
    throw new Error('At least one moderation scan part is required');
  }

  const scanMediaIds: string[] = [];

  for (const part of parts) {
    const scanRes = await api.e2eUploads.requestScanUpload(
      {
        scanHash,
        contentType: part.contentType,
        contentLength: part.body.size,
      },
      signal ? { signal } : undefined
    );
    if (!scanRes.success || !scanRes.data) {
      throw new Error(
        (!scanRes.success && 'error' in scanRes ? scanRes.error?.message : null) ??
          'Failed to prepare scan upload'
      );
    }
    const { scanMediaId, uploadUrl: scanUrl } = scanRes.data;

    const scanPut = await fetch(scanUrl, {
      method: 'PUT',
      headers: { 'Content-Type': part.contentType },
      body: part.body,
      signal,
    });
    if (!scanPut.ok) throw new Error(`Scan upload failed (${scanPut.status})`);

    const scanComplete = await api.e2eUploads.completeScanUpload(
      scanMediaId,
      signal ? { signal } : undefined
    );
    if (!scanComplete.success) throw new Error('Failed to finalise scan upload');

    scanMediaIds.push(scanMediaId);
  }

  const manifestParts = await Promise.all(
    parts.map(async (part, i) => ({
      mediaId: scanMediaIds[i]!,
      contentSha256: await sha256HexLower(part.body),
    }))
  );
  manifestParts.sort((a, b) => a.mediaId.localeCompare(b.mediaId));

  const manifest: ConvScanSealManifestV1 = {
    version: 1,
    parts: manifestParts,
  };

  const sealRes = await api.e2eUploads.sealConvScanSession(
    {
      scanHash,
      scanMediaIds,
      manifest,
    },
    signal ? { signal } : undefined
  );
  if (!sealRes.success) {
    throw new Error(
      (!sealRes.success && 'error' in sealRes ? sealRes.error?.message : null) ??
        'Failed to seal scan session'
    );
  }
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

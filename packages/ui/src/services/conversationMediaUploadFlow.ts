import { createApiClient, type ConvScanSealManifestV1 } from '@adieuu/shared';
import { getImageDimensionsAndThumbnailJpeg } from '../utils/imageProcessing';
import {
  getVideoDimensionsAndScanThumbnail,
  probeVideoPlayableInBrowser,
} from '../utils/videoProcessing';
import { sha256HexLower } from '../utils/blobDigest';
import { buildVideoModerationScanPayloads } from '../utils/videoModerationFrames';

const VIDEO_SCAN_PREP_FAILED =
  'Could not build video frames for the safety scan. Try re-encoding to a standard H.264 MP4, or turn off "No re-encoding (MP4 only)" if it is enabled.';

/** Returns true for MIME types that go through the visual moderation pipeline. */
export function isVisualMediaFile(file: File): boolean {
  const visualTypes: readonly string[] = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4',
  ];
  return visualTypes.includes(file.type);
}

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
 * Images: thumbnail JPEG. Video: composite JPEG grid of sampled frames for hash checking.
 */
export type ModerationScanPayload = {
  body: Blob;
  contentType: 'image/jpeg' | 'video/mp4';
};

/** E2E phase result plus scan assets for the moderation pipeline (upload scan copy separately). */
export type ConversationE2EUploadResult = MediaUploadResult & {
  scanThumbnail?: Blob;
  /** One thumbnail/grid for images; one or more segment grids for long video. Absent for non-visual files. */
  moderationScan?: ModerationScanPayload | ModerationScanPayload[];
};

export type PrepareConversationMediaOptions = {
  signal?: AbortSignal;
  /**
   * When true and the file is `video/mp4`, skip ffmpeg re-encoding even if the
   * browser cannot decode it (e.g. HEVC). Playback and scan frames are best-effort.
   * Other containers still require transcoding because the API accepts MP4 only.
   */
  sendMp4WithoutReencode?: boolean;
};

/**
 * Ensure video is MP4 (server accepts MP4 only) and the browser can decode it
 * for dimensions/thumbnails (H.264). HEVC-in-MP4 and other opaque MP4s are
 * re-encoded to H.264/AAC via ffmpeg.wasm unless {@link PrepareConversationMediaOptions.sendMp4WithoutReencode} is set.
 * Call with the same File you encrypt and pass to {@link uploadE2EMediaOnly}.
 */
export async function prepareConversationMediaFileForUpload(
  file: File,
  options?: PrepareConversationMediaOptions
): Promise<File> {
  const signal = options?.signal;
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  };

  if (!isVisualMediaFile(file)) {
    return file;
  }

  if (!file.type.startsWith('video/')) {
    return file;
  }
  const { transcodeVideoToMp4 } = await import('../utils/videoTranscode');
  throwIfAborted();
  if (file.type === 'video/mp4') {
    if (options?.sendMp4WithoutReencode === true) {
      return file;
    }
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
  /**
   * When true, `rawFile` was already passed through {@link prepareConversationMediaFileForUpload}
   * (same bytes as `encryptedBlob` was derived from). Avoids duplicate transcode work in the media outbox.
   */
  alreadyPrepared?: boolean;
  /** When true, skip moderation scanning — media goes straight to available. */
  skipModeration?: boolean;
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

  const { width, height, thumbnail } = await getImageDimensionsAndThumbnailJpeg(file);
  return { dimensions: { width, height }, thumbnail };
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
  const file = options?.alreadyPrepared
    ? rawFile
    : await prepareConversationMediaFileForUpload(rawFile, { signal });
  const stripExif = options?.stripExif ?? true;
  const onUploadsComplete = options?.onUploadsComplete;
  const isVisual = isVisualMediaFile(file);

  let dimensions = { width: 0, height: 0 };
  let thumbnail: Blob | undefined;
  let durationSeconds: number | undefined;

  if (isVisual) {
    const result = await buildDimensionsAndScanThumbnail(file);
    dimensions = result.dimensions;
    thumbnail = result.thumbnail;
    durationSeconds = result.durationSeconds;
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const effectiveStripExif = isVideoFile(file) ? false : (isVisual ? stripExif : false);

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
  const { e2eMediaId: mediaId, uploadUrl: e2eUrl, scanHash: hash, uploadHeaders: e2eHeaders } = e2eRes.data;

  const e2ePut = await fetch(e2eUrl, {
    method: 'PUT',
    headers: e2eHeaders ?? { 'Content-Type': 'application/octet-stream' },
    body: encryptedBlob,
    signal,
  });
  if (!e2ePut.ok) throw new Error(`E2E upload failed (${e2ePut.status})`);

  const skipModeration = options?.skipModeration === true || !isVisual;
  const e2eComplete = await api.e2eUploads.completeE2EUpload(
    mediaId,
    signal ? { signal } : undefined,
    skipModeration ? { skipModeration: true } : undefined
  );
  if (!e2eComplete.success) throw new Error('Failed to finalise E2E upload');

  onUploadsComplete?.();

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  if (skipModeration) {
    return {
      e2eMediaId: mediaId,
      scanHash: hash,
      contentType: file.type,
      fileName: file.name,
      width: dimensions.width,
      height: dimensions.height,
      sizeBytes: encryptedBlob.size,
      exifPreserved: !effectiveStripExif,
    };
  }

  let moderationScan: ModerationScanPayload | ModerationScanPayload[];
  if (isVideoFile(file)) {
    try {
      const payloads = await buildVideoModerationScanPayloads(file, {
        ...(durationSeconds !== undefined
          ? { precomputedVideoDurationSeconds: durationSeconds }
          : {}),
      });
      moderationScan = payloads.length === 1 ? payloads[0]! : payloads;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`${VIDEO_SCAN_PREP_FAILED} (${detail})`);
    }
  } else {
    moderationScan = { body: thumbnail!, contentType: 'image/jpeg' };
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
 * Upload cleartext scan copy for local hash moderation (JPEG thumbnail or frame grid).
 * Pass multiple parts for a multi-part scan session; all parts are completed then the session is sealed.
 * Run after message send so it cannot delay send.
 */
export async function uploadModerationScanCopy(
  api: ReturnType<typeof createApiClient>,
  scanHash: string,
  payload: ModerationScanPayload | ModerationScanPayload[] | undefined,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const signal = options?.signal;
  if (!payload) return;
  const parts = Array.isArray(payload) ? payload : [payload];
  if (parts.length === 0) return;

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
    const { scanMediaId, uploadUrl: scanUrl, uploadHeaders: scanHeaders } = scanRes.data;

    const scanPut = await fetch(scanUrl, {
      method: 'PUT',
      headers: scanHeaders ?? { 'Content-Type': part.contentType },
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
  if (moderationScan) {
    await uploadModerationScanCopy(api, rest.scanHash, moderationScan, { signal });
  }
  options?.onUploadsComplete?.();
  return rest;
}

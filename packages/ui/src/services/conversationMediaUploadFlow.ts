import { createApiClient } from '@adieuu/shared';
import {
  generateThumbnail,
  getImageDimensions,
} from '../utils/imageProcessing';
import type { MediaUploadResult } from '../hooks/useConversationMediaUpload';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 90;

export type UploadMediaFileOptions = {
  stripExif?: boolean;
  signal?: AbortSignal;
  /** Called after both S3 uploads and complete-* API calls succeed, before moderation polling. */
  onUploadsComplete?: () => void;
};

export async function uploadMediaFile(
  api: ReturnType<typeof createApiClient>,
  file: File,
  encryptedBlob: Blob,
  options?: UploadMediaFileOptions,
): Promise<MediaUploadResult> {
  const signal = options?.signal;
  const stripExif = options?.stripExif ?? true;
  const onUploadsComplete = options?.onUploadsComplete;

  const [dimensions, thumbnail] = await Promise.all([
    getImageDimensions(file),
    generateThumbnail(file),
  ]);

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const e2eRes = await api.e2eUploads.requestE2EUpload({
    contentType: file.type,
    contentLength: encryptedBlob.size,
    stripExif,
  });
  if (!e2eRes.success || !e2eRes.data) {
    throw new Error(
      (!e2eRes.success && 'error' in e2eRes ? e2eRes.error?.message : null) ??
        'Failed to prepare E2E upload',
    );
  }
  const { e2eMediaId: mediaId, uploadUrl: e2eUrl, scanHash: hash } = e2eRes.data;

  const scanRes = await api.e2eUploads.requestScanUpload({
    scanHash: hash,
    contentType: 'image/jpeg',
    contentLength: thumbnail.size,
  });
  if (!scanRes.success || !scanRes.data) {
    throw new Error(
      (!scanRes.success && 'error' in scanRes ? scanRes.error?.message : null) ??
        'Failed to prepare scan upload',
    );
  }
  const { scanMediaId, uploadUrl: scanUrl } = scanRes.data;

  const [e2ePut, scanPut] = await Promise.all([
    fetch(e2eUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: encryptedBlob,
      signal,
    }),
    fetch(scanUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: thumbnail,
      signal,
    }),
  ]);
  if (!e2ePut.ok) throw new Error(`E2E upload failed (${e2ePut.status})`);
  if (!scanPut.ok) throw new Error(`Scan upload failed (${scanPut.status})`);

  const [e2eComplete, scanComplete] = await Promise.all([
    api.e2eUploads.completeE2EUpload(mediaId),
    api.e2eUploads.completeScanUpload(scanMediaId),
  ]);
  if (!e2eComplete.success) throw new Error('Failed to finalise E2E upload');
  if (!scanComplete.success) throw new Error('Failed to finalise scan upload');

  onUploadsComplete?.();

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await api.e2eUploads.getE2EMediaStatus(mediaId);
    if (!res.success || !res.data) continue;
    if (res.data.status === 'available') {
      return {
        e2eMediaId: mediaId,
        scanHash: hash,
        contentType: file.type,
        fileName: file.name,
        width: dimensions.width,
        height: dimensions.height,
        sizeBytes: file.size,
        exifPreserved: !stripExif,
      };
    }
    if (res.data.moderationStatus === 'rejected') {
      throw new Error('Content has been rejected by moderation');
    }
  }
  throw new Error('Moderation scan timed out. Please try again.');
}

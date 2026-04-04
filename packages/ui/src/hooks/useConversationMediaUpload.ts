/**
 * Hook for orchestrating the dual-upload flow for E2E conversation media.
 *
 * Flow:
 * 1. Client-side: generate thumbnail (max 512x512) for scan copy
 * 2. Client-side: optionally strip EXIF from original
 * 3. Request E2E upload (receive e2eMediaId, scanHash, presigned URL)
 * 4. Request scan upload (send scanHash, receive presigned URL)
 * 5. Upload both in parallel:
 *    - Encrypted blob -> E2E bucket (PUT with application/octet-stream)
 *    - Cleartext thumbnail -> media bucket (PUT with image/*)
 * 6. Complete both uploads
 * 7. Poll E2E media status until moderation passes
 *
 * The caller is responsible for encrypting the blob before calling
 * `uploadMedia`. This hook handles orchestration, not crypto.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import {
  createApiClient,
  type E2EMediaStatus,
} from '@adieuu/shared';
import { useAppConfig } from '../config';
import {
  generateThumbnail,
  stripExifMetadata,
  getImageDimensions,
} from '../utils/imageProcessing';

export type ConversationMediaUploadState =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'scanning'
  | 'available'
  | 'rejected'
  | 'error';

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

export interface UseConversationMediaUploadOptions {
  onComplete?: (result: MediaUploadResult) => void;
  onError?: (error: string) => void;
}

export interface UseConversationMediaUploadReturn {
  uploadMedia: (
    file: File,
    encryptedBlob: Blob,
    options?: { stripExif?: boolean }
  ) => Promise<MediaUploadResult | null>;
  reset: () => void;
  state: ConversationMediaUploadState;
  e2eMediaId: string | null;
  scanHash: string | null;
  progress: number;
  error: string | null;
  /** Synchronously-readable error (safe to read immediately after uploadMedia resolves) */
  errorRef: React.RefObject<string | null>;
  moderationStatus: string | null;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 90;

export function useConversationMediaUpload(
  options: UseConversationMediaUploadOptions = {}
): UseConversationMediaUploadReturn {
  const { onComplete, onError } = options;
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const abortRef = useRef<AbortController | null>(null);

  const [state, setState] = useState<ConversationMediaUploadState>('idle');
  const [e2eMediaId, setE2EMediaId] = useState<string | null>(null);
  const [scanHash, setScanHash] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<string | null>(null);
  const [moderationStatus, setModerationStatus] = useState<string | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState('idle');
    setE2EMediaId(null);
    setScanHash(null);
    setProgress(0);
    setError(null);
    errorRef.current = null;
    setModerationStatus(null);
  }, []);

  const fail = useCallback(
    (msg: string, overrideState?: ConversationMediaUploadState) => {
      errorRef.current = msg;
      setError(msg);
      setState(overrideState ?? 'error');
      onError?.(msg);
    },
    [onError]
  );

  const pollE2EStatus = useCallback(
    async (mediaId: string, abort: AbortController): Promise<E2EMediaStatus | null> => {
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        if (abort.signal.aborted) return null;

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (abort.signal.aborted) return null;

        const res = await api.e2eUploads.getE2EMediaStatus(mediaId);
        if (!res.success || !res.data) continue;

        setModerationStatus(res.data.moderationStatus);
        setProgress(60 + Math.min(i, 35));

        if (res.data.status === 'available') {
          return 'available';
        }
        if (res.data.moderationStatus === 'rejected') {
          return 'gated';
        }
      }
      return null;
    },
    [api]
  );

  const uploadMedia = useCallback(
    async (
      file: File,
      encryptedBlob: Blob,
      uploadOptions?: { stripExif?: boolean }
    ): Promise<MediaUploadResult | null> => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      setError(null);
      setModerationStatus(null);
      setE2EMediaId(null);
      setScanHash(null);

      const stripExif = uploadOptions?.stripExif ?? true;

      try {
        setState('preparing');
        setProgress(5);

        // TODO [VIDEO SUPPORT]: For video files, extract a representative frame
        // for the thumbnail instead of using the file directly. Requires a
        // client-side video frame extractor (Canvas + <video> element or
        // ffmpeg.wasm). Video dimensions can be read from the <video> metadata.
        const [dimensions, thumbnail] = await Promise.all([
          getImageDimensions(file),
          generateThumbnail(file),
        ]);

        if (abort.signal.aborted) return null;
        setProgress(10);

        // Step 1: Request E2E upload
        const e2eRes = await api.e2eUploads.requestE2EUpload({
          contentType: file.type,
          contentLength: encryptedBlob.size,
          stripExif,
        });

        if (!e2eRes.success || !e2eRes.data) {
          fail(
            (!e2eRes.success && 'error' in e2eRes ? e2eRes.error?.message : null) ??
              'Failed to prepare E2E upload'
          );
          return null;
        }

        const {
          e2eMediaId: mediaId,
          uploadUrl: e2eUrl,
          scanHash: hash,
        } = e2eRes.data;
        setE2EMediaId(mediaId);
        setScanHash(hash);

        if (abort.signal.aborted) return null;

        // Step 2: Request scan upload
        const scanRes = await api.e2eUploads.requestScanUpload({
          scanHash: hash,
          contentType: 'image/jpeg',
          contentLength: thumbnail.size,
        });

        if (!scanRes.success || !scanRes.data) {
          fail(
            (!scanRes.success && 'error' in scanRes ? scanRes.error?.message : null) ??
              'Failed to prepare scan upload'
          );
          return null;
        }

        const { scanMediaId, uploadUrl: scanUrl } = scanRes.data;

        if (abort.signal.aborted) return null;

        // Step 3: Upload both in parallel
        setState('uploading');
        setProgress(20);

        const [e2ePut, scanPut] = await Promise.all([
          fetch(e2eUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: encryptedBlob,
            signal: abort.signal,
          }),
          fetch(scanUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: thumbnail,
            signal: abort.signal,
          }),
        ]);

        if (!e2ePut.ok) {
          fail(`E2E upload failed (${e2ePut.status})`);
          return null;
        }
        if (!scanPut.ok) {
          fail(`Scan upload failed (${scanPut.status})`);
          return null;
        }

        setProgress(45);
        if (abort.signal.aborted) return null;

        // Step 4: Complete both uploads
        const [e2eComplete, scanComplete] = await Promise.all([
          api.e2eUploads.completeE2EUpload(mediaId),
          api.e2eUploads.completeScanUpload(scanMediaId),
        ]);

        if (!e2eComplete.success) {
          fail('Failed to finalise E2E upload');
          return null;
        }
        if (!scanComplete.success) {
          fail('Failed to finalise scan upload');
          return null;
        }

        setProgress(55);

        // Step 5: Poll for moderation
        setState('scanning');

        const finalStatus = await pollE2EStatus(mediaId, abort);
        if (abort.signal.aborted) return null;

        if (finalStatus === 'available') {
          setState('available');
          setProgress(100);

          const result: MediaUploadResult = {
            e2eMediaId: mediaId,
            scanHash: hash,
            contentType: file.type,
            fileName: file.name,
            width: dimensions.width,
            height: dimensions.height,
            sizeBytes: file.size,
            exifPreserved: !stripExif,
          };

          onComplete?.(result);
          return result;
        }

        if (finalStatus === 'gated') {
          fail('Content has been rejected by moderation', 'rejected');
          return null;
        }

        fail('Moderation scan timed out. Please try again.');
        return null;
      } catch (err) {
        if (abort.signal.aborted) return null;
        const msg = err instanceof Error ? err.message : 'Upload failed';
        fail(msg);
        return null;
      }
    },
    [api, fail, onComplete, pollE2EStatus]
  );

  return {
    uploadMedia,
    reset,
    state,
    e2eMediaId,
    scanHash,
    progress,
    error,
    errorRef,
    moderationStatus,
  };
}

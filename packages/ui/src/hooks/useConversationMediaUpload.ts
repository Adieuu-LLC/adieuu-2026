/**
 * Hook for orchestrating the dual-upload flow for E2E conversation media.
 *
 * Upload completes when both blobs are stored and complete-* calls succeed.
 * Moderation runs server-side; messages may be sent before moderation finishes.
 *
 * The caller is responsible for encrypting the blob before calling `uploadMedia`.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';
import {
  uploadMediaFile,
  type MediaUploadResult,
  type UploadMediaFileOptions,
} from '../services/conversationMediaUploadFlow';

export type ConversationMediaUploadState =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'available'
  | 'rejected'
  | 'error';

export type { MediaUploadResult };

export interface UseConversationMediaUploadOptions {
  onComplete?: (result: MediaUploadResult) => void;
  onError?: (error: string) => void;
}

export interface UseConversationMediaUploadReturn {
  uploadMedia: (
    file: File,
    encryptedBlob: Blob,
    options?: { stripExif?: boolean; onUploadsComplete?: () => void }
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

export {
  uploadMediaFile,
  uploadE2EMediaOnly,
  uploadModerationScanCopy,
  prepareConversationMediaFileForUpload,
  type PrepareConversationMediaOptions,
  type UploadMediaFileOptions,
  type ModerationScanPayload,
} from '../services/conversationMediaUploadFlow';

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
  const [moderationStatus] = useState<string | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState('idle');
    setE2EMediaId(null);
    setScanHash(null);
    setProgress(0);
    setError(null);
    errorRef.current = null;
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

  const uploadMedia = useCallback(
    async (
      file: File,
      encryptedBlob: Blob,
      uploadOptions?: { stripExif?: boolean; onUploadsComplete?: () => void }
    ): Promise<MediaUploadResult | null> => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      setError(null);
      setE2EMediaId(null);
      setScanHash(null);

      const stripExif = uploadOptions?.stripExif ?? true;
      const onUploadsComplete = uploadOptions?.onUploadsComplete;

      try {
        setState('preparing');
        setProgress(5);

        setState('uploading');
        setProgress(20);

        const result = await uploadMediaFile(api, file, encryptedBlob, {
          stripExif,
          signal: abort.signal,
          onUploadsComplete: () => {
            setProgress(85);
            onUploadsComplete?.();
          },
        });

        if (abort.signal.aborted) return null;

        setE2EMediaId(result.e2eMediaId);
        setScanHash(result.scanHash);
        setState('available');
        setProgress(100);

        onComplete?.(result);
        return result;
      } catch (err) {
        if (abort.signal.aborted) return null;
        const msg = err instanceof Error ? err.message : 'Upload failed';
        fail(msg);
        return null;
      }
    },
    [api, fail, onComplete]
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

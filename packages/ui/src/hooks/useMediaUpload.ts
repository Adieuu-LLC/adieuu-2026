/**
 * Reusable media upload hook.
 *
 * Encapsulates the full presigned-POST upload flow:
 * 1. Request presigned POST URL + form fields from the API
 * 2. Upload file directly to S3 via POST (multipart/form-data)
 * 3. Notify API that upload is complete
 * 4. Poll for processing status until ready/rejected/failed
 *
 * Used by AvatarUpload, BannerUpload, and any future media upload components.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import {
  createApiClient,
  type UploadPurpose,
  type UploadStatus,
} from '@adieuu/shared';
import { useAppConfig } from '../config';

export interface UseMediaUploadOptions {
  purpose: UploadPurpose;
  maxSizeBytes: number;
  acceptedTypes: string[];
  /** Required when purpose is `space_media`. */
  spaceId?: string;
  onComplete?: (mediaId: string, cdnUrl: string) => void;
  onError?: (error: string) => void;
}

export type MediaUploadState = 'idle' | 'requesting' | 'uploading' | 'processing' | 'complete' | 'error';

export interface UseMediaUploadReturn {
  upload: (file: File) => Promise<void>;
  reset: () => void;
  state: MediaUploadState;
  uploadStatus: UploadStatus | null;
  progress: number;
  error: string | null;
  mediaId: string | null;
  cdnUrl: string | null;
}

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 60;

export function useMediaUpload(options: UseMediaUploadOptions): UseMediaUploadReturn {
  const { purpose, maxSizeBytes, acceptedTypes, spaceId, onComplete, onError } = options;
  const { apiBaseUrl } = useAppConfig();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const abortRef = useRef<AbortController | null>(null);

  const [state, setState] = useState<MediaUploadState>('idle');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [cdnUrl, setCdnUrl] = useState<string | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState('idle');
    setUploadStatus(null);
    setProgress(0);
    setError(null);
    setMediaId(null);
    setCdnUrl(null);
  }, []);

  const pollStatus = useCallback(
    async (id: string, abort: AbortController): Promise<void> => {
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        if (abort.signal.aborted) return;

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (abort.signal.aborted) return;

        const statusRes = await api.uploads.getStatus(id);

        if (!statusRes.success || !statusRes.data) continue;

        const { status: pollStatus, cdnUrl: pollCdnUrl } = statusRes.data;
        setUploadStatus(pollStatus);

        if (pollStatus === 'ready' && pollCdnUrl) {
          setCdnUrl(pollCdnUrl);
          setState('complete');
          setProgress(100);
          onComplete?.(id, pollCdnUrl);
          return;
        }

        if (pollStatus === 'rejected') {
          const reason = statusRes.data.rejectionReason ?? 'Content was rejected';
          setError(reason);
          setState('error');
          onError?.(reason);
          return;
        }

        if (pollStatus === 'failed') {
          setError('Processing failed. Please try again.');
          setState('error');
          onError?.('Processing failed');
          return;
        }

        setProgress(50 + Math.min(i * 2, 40));
      }

      setError('Processing timed out. Please try again.');
      setState('error');
      onError?.('Processing timed out');
    },
    [api, onComplete, onError]
  );

  const upload = useCallback(
    async (file: File): Promise<void> => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      setError(null);
      setCdnUrl(null);
      setMediaId(null);
      setUploadStatus(null);

      if (!acceptedTypes.includes(file.type)) {
        const msg = `File type '${file.type}' is not supported`;
        setError(msg);
        setState('error');
        onError?.(msg);
        return;
      }

      if (file.size > maxSizeBytes) {
        const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
        const msg = `File exceeds the ${maxMb} MB limit`;
        setError(msg);
        setState('error');
        onError?.(msg);
        return;
      }

      try {
        setState('requesting');
        setProgress(5);

        const requestRes = await api.uploads.requestUpload({
          purpose,
          contentType: file.type,
          contentLength: file.size,
          ...(spaceId ? { spaceId } : {}),
        });

        if (!requestRes.success || !requestRes.data) {
          const msg =
            (!requestRes.success && 'error' in requestRes
              ? requestRes.error?.message
              : null) ?? 'Failed to prepare upload';
          setError(msg);
          setState('error');
          onError?.(msg);
          return;
        }

        const { mediaId: mid, uploadUrl, uploadFields, uploadHeaders } = requestRes.data;
        setMediaId(mid);

        if (abort.signal.aborted) return;

        setState('uploading');
        setProgress(10);

        if (uploadHeaders) {
          const putResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: uploadHeaders,
            body: file,
            signal: abort.signal,
          });

          if (!putResponse.ok) {
            const msg = `Upload failed (${putResponse.status})`;
            setError(msg);
            setState('error');
            onError?.(msg);
            return;
          }
        } else if (uploadFields) {
          const formData = new FormData();
          for (const [key, value] of Object.entries(uploadFields)) {
            formData.append(key, value);
          }
          formData.append('file', file);

          const postResponse = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
            signal: abort.signal,
          });

          if (postResponse.status !== 204 && !postResponse.ok) {
            const msg = `Upload failed (${postResponse.status})`;
            setError(msg);
            setState('error');
            onError?.(msg);
            return;
          }
        } else {
          const msg = 'Upload response missing both uploadHeaders and uploadFields';
          setError(msg);
          setState('error');
          onError?.(msg);
          return;
        }

        setProgress(40);

        if (abort.signal.aborted) return;

        const completeRes = await api.uploads.completeUpload(mid);
        if (!completeRes.success) {
          const msg = 'Failed to finalise upload';
          setError(msg);
          setState('error');
          onError?.(msg);
          return;
        }

        setProgress(50);
        setState('processing');
        setUploadStatus('uploaded');

        await pollStatus(mid, abort);
      } catch (err) {
        if (abort.signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setError(msg);
        setState('error');
        onError?.(msg);
      }
    },
    [api, purpose, maxSizeBytes, acceptedTypes, spaceId, pollStatus, onComplete, onError]
  );

  return {
    upload,
    reset,
    state,
    uploadStatus,
    progress,
    error,
    mediaId,
    cdnUrl,
  };
}

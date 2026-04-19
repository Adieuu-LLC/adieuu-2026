/**
 * Hook for downloading and decrypting E2E media attachments.
 *
 * Given an attachment from a decrypted message payload, this hook:
 * 1. Requests a gated presigned download URL from the API
 * 2. Polls if the scan is still pending (moderation not yet resolved)
 * 3. Fetches the encrypted blob from S3
 * 4. Decrypts using the per-attachment symmetric key + nonce
 * 5. Produces a blob URL for rendering
 *
 * Decrypted blob URLs are cached at the module level so that message list
 * mount/unmount cycles do not trigger repeated downloads. The cache can
 * be flushed by calling `clearMediaCache()` when switching conversations.
 *
 * SECURITY: The encryptionKey and encryptionNonce live exclusively inside
 * the E2E-encrypted message payload — the server never sees them.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createApiClient, mapModerationReasonToUserMessage } from '@adieuu/shared';
import { decrypt as decryptSymmetric, fromBase64 } from '@adieuu/crypto';
import { useAppConfig } from '../config';
import type { MediaAttachment } from '../services/messagePayload';
import type { MediaMessageState } from '../components/MediaMessage';

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 72; // ~3 minutes

// ---------------------------------------------------------------------------
// Module-level cache: survives list remount cycles.
// Keyed by e2eMediaId so each attachment is downloaded and decrypted at most
// once per session (or until clearMediaCache is called).
// ---------------------------------------------------------------------------

interface CachedMedia {
  url: string;
  state: MediaMessageState;
  rejectionReason?: string;
}

const mediaCache = new Map<string, CachedMedia>();

const inflightDownloads = new Map<string, Promise<CachedMedia | null>>();

export function clearMediaCache(): void {
  for (const entry of mediaCache.values()) {
    if (entry.url) URL.revokeObjectURL(entry.url);
  }
  mediaCache.clear();
  inflightDownloads.clear();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseE2EMediaDownloadReturn {
  state: MediaMessageState;
  imageUrl: string | null;
  rejectionReason: string | null;
  errorMessage: string | null;
  retry: () => void;
}

export function useE2EMediaDownload(
  attachment: MediaAttachment
): UseE2EMediaDownloadReturn {
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const mediaId = attachment.e2eMediaId;

  const cached = mediaCache.get(mediaId);
  const [state, setState] = useState<MediaMessageState>(cached?.state ?? 'loading');
  const [imageUrl, setImageUrl] = useState<string | null>(cached?.url ?? null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(cached?.rejectionReason ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const mountedRef = useRef(true);

  const retry = useCallback(() => {
    mediaCache.delete(mediaId);
    inflightDownloads.delete(mediaId);
    setRetryCount((c) => c + 1);
  }, [mediaId]);

  useEffect(() => {
    mountedRef.current = true;

    if (mediaCache.has(mediaId)) {
      const c = mediaCache.get(mediaId)!;
      setState(c.state);
      setImageUrl(c.url);
      setRejectionReason(c.rejectionReason ?? null);
      setErrorMessage(null);
      return () => { mountedRef.current = false; };
    }

    const abort = new AbortController();

    async function downloadAndDecrypt(): Promise<CachedMedia | null> {
      try {
        let downloadUrl: string | null = null;

        const firstAttempt = await api.e2eUploads.getE2EMediaDownload(mediaId);
        if (abort.signal.aborted) return null;

        if (firstAttempt.success && firstAttempt.data) {
          downloadUrl = firstAttempt.data.downloadUrl;
        } else {
          const code = firstAttempt.error?.code;

          if (code === 'SCAN_PENDING') {
            if (mountedRef.current) setState('scanning');
            downloadUrl = await pollUntilAvailable(abort);
            if (abort.signal.aborted) return null;
          } else if (code === 'FORBIDDEN' || code === 'REJECTED' || code === 'MODERATION_ERROR') {
            const rawReason =
              firstAttempt.error?.details?.moderationReason ??
              firstAttempt.error?.message;
            const reason =
              mapModerationReasonToUserMessage(
                typeof rawReason === 'string' ? rawReason : undefined,
              ) ?? rawReason;
            const entry: CachedMedia = {
              url: '',
              state: 'rejected',
              rejectionReason: reason,
            };
            mediaCache.set(mediaId, entry);
            if (mountedRef.current) {
              setState('rejected');
              setRejectionReason(entry.rejectionReason ?? null);
            }
            return entry;
          } else {
            if (mountedRef.current) {
              setState('error');
              setErrorMessage(firstAttempt.error?.message ?? 'Failed to load media');
            }
            return null;
          }
        }

        if (!downloadUrl) {
          if (mountedRef.current && !abort.signal.aborted) {
            setState('error');
            setErrorMessage('Media not available after moderation scan');
          }
          return null;
        }

        const response = await fetch(downloadUrl);
        if (abort.signal.aborted) return null;

        if (!response.ok) {
          if (mountedRef.current) {
            setState('error');
            setErrorMessage('Failed to download media');
          }
          return null;
        }

        const ciphertext = new Uint8Array(await response.arrayBuffer());
        if (abort.signal.aborted) return null;

        const key = fromBase64(attachment.encryptionKey);
        const nonce = fromBase64(attachment.encryptionNonce);
        const plaintext = decryptSymmetric(key, ciphertext, nonce);

        const blob = new Blob([plaintext.buffer as ArrayBuffer], {
          type: attachment.contentType,
        });
        const url = URL.createObjectURL(blob);

        if (abort.signal.aborted) {
          URL.revokeObjectURL(url);
          return null;
        }

        const entry: CachedMedia = { url, state: 'available' };
        mediaCache.set(mediaId, entry);

        if (mountedRef.current) {
          setImageUrl(url);
          setState('available');
        }

        return entry;
      } catch (err) {
        if (mountedRef.current && !abort.signal.aborted) {
          console.error('[useE2EMediaDownload] Error:', err);
          setState('error');
          setErrorMessage(
            err instanceof Error ? err.message : 'Failed to decrypt media'
          );
        }
        return null;
      }
    }

    async function pollUntilAvailable(
      ac: AbortController
    ): Promise<string | null> {
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        if (ac.signal.aborted) return null;

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (ac.signal.aborted) return null;

        const res = await api.e2eUploads.getE2EMediaDownload(mediaId);

        if (res.success && res.data) {
          return res.data.downloadUrl;
        }

        const code = res.error?.code;
        if (code === 'FORBIDDEN' || code === 'REJECTED' || code === 'MODERATION_ERROR') {
          const rawReason =
            res.error?.details?.moderationReason ??
            res.error?.message;
          const reason =
            mapModerationReasonToUserMessage(
              typeof rawReason === 'string' ? rawReason : undefined,
            ) ?? rawReason;
          const entry: CachedMedia = {
            url: '',
            state: 'rejected',
            rejectionReason: reason,
          };
          mediaCache.set(mediaId, entry);
          if (mountedRef.current) {
            setState('rejected');
            setRejectionReason(entry.rejectionReason ?? null);
          }
          return null;
        }

        if (code !== 'SCAN_PENDING') {
          if (mountedRef.current) {
            setState('error');
            setErrorMessage(res.error?.message ?? 'Unexpected status during moderation');
          }
          return null;
        }
      }

      return null;
    }

    // De-duplicate concurrent downloads for the same mediaId (e.g. when
    // the same attachment renders in quick succession).
    let promise = inflightDownloads.get(mediaId);
    if (!promise) {
      promise = downloadAndDecrypt();
      inflightDownloads.set(mediaId, promise);
      void promise.finally(() => inflightDownloads.delete(mediaId));
    } else {
      void promise.then((entry) => {
        if (entry && mountedRef.current) {
          setState(entry.state);
          setImageUrl(entry.url);
          setRejectionReason(entry.rejectionReason ?? null);
          setErrorMessage(null);
        }
      });
    }

    return () => {
      mountedRef.current = false;
      abort.abort();
    };
  }, [api, mediaId, attachment.encryptionKey, attachment.encryptionNonce, attachment.contentType, retryCount]);

  return { state, imageUrl, rejectionReason, errorMessage, retry };
}

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
 * Blob URLs are revoked on unmount to prevent memory leaks.
 *
 * SECURITY: The encryptionKey and encryptionNonce live exclusively inside
 * the E2E-encrypted message payload — the server never sees them.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createApiClient } from '@adieuu/shared';
import { decrypt as decryptSymmetric, fromBase64 } from '@adieuu/crypto';
import { useAppConfig } from '../config';
import type { MediaAttachment } from '../services/messagePayload';
import type { MediaMessageState } from '../components/MediaMessage';

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 72; // ~3 minutes

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
  const [state, setState] = useState<MediaMessageState>('loading');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    abortRef.current = abort;

    async function run() {
      setState('loading');
      setErrorMessage(null);
      setRejectionReason(null);

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
        setImageUrl(null);
      }

      try {
        let downloadUrl: string | null = null;

        const firstAttempt = await api.e2eUploads.getE2EMediaDownload(
          attachment.e2eMediaId
        );

        if (abort.signal.aborted) return;

        if (firstAttempt.success && firstAttempt.data) {
          downloadUrl = firstAttempt.data.downloadUrl;
        } else {
          const code = firstAttempt.error?.code;

          if (code === 'SCAN_PENDING') {
            setState('scanning');
            downloadUrl = await pollUntilAvailable(abort);
            if (abort.signal.aborted) return;
          } else if (code === 'FORBIDDEN') {
            setState('rejected');
            setRejectionReason(firstAttempt.error?.message ?? null);
            return;
          } else {
            setState('error');
            setErrorMessage(firstAttempt.error?.message ?? 'Failed to load media');
            return;
          }
        }

        if (!downloadUrl) {
          if (!abort.signal.aborted) {
            setState('error');
            setErrorMessage('Media not available after moderation scan');
          }
          return;
        }

        const response = await fetch(downloadUrl);
        if (abort.signal.aborted) return;

        if (!response.ok) {
          setState('error');
          setErrorMessage('Failed to download media');
          return;
        }

        const ciphertext = new Uint8Array(await response.arrayBuffer());
        if (abort.signal.aborted) return;

        const key = fromBase64(attachment.encryptionKey);
        const nonce = fromBase64(attachment.encryptionNonce);
        const plaintext = decryptSymmetric(key, ciphertext, nonce);

        const blob = new Blob([plaintext.buffer as ArrayBuffer], { type: attachment.contentType });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        if (abort.signal.aborted) {
          URL.revokeObjectURL(url);
          blobUrlRef.current = null;
          return;
        }

        setImageUrl(url);
        setState('available');
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error('[useE2EMediaDownload] Error:', err);
          setState('error');
          setErrorMessage(
            err instanceof Error ? err.message : 'Failed to decrypt media'
          );
        }
      }
    }

    async function pollUntilAvailable(
      ac: AbortController
    ): Promise<string | null> {
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        if (ac.signal.aborted) return null;

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (ac.signal.aborted) return null;

        const res = await api.e2eUploads.getE2EMediaDownload(
          attachment.e2eMediaId
        );

        if (res.success && res.data) {
          return res.data.downloadUrl;
        }

        const code = res.error?.code;
        if (code === 'FORBIDDEN') {
          setState('rejected');
          setRejectionReason(res.error?.message ?? null);
          return null;
        }

        if (code !== 'SCAN_PENDING') {
          setState('error');
          setErrorMessage(res.error?.message ?? 'Unexpected status during moderation');
          return null;
        }
      }

      return null;
    }

    void run();

    return () => {
      abort.abort();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [api, attachment.e2eMediaId, attachment.encryptionKey, attachment.encryptionNonce, attachment.contentType, retryCount]);

  return { state, imageUrl, rejectionReason, errorMessage, retry };
}

/**
 * Upload cleartext Space channel attachments (`space_media`) and wait until ready.
 */

import type { createApiClient } from '@adieuu/shared';

type UploadsApi = ReturnType<typeof createApiClient>['uploads'];

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 60;

export async function uploadSpaceCleartextMedia(
  api: { uploads: UploadsApi },
  spaceId: string,
  file: File,
  signal?: AbortSignal,
): Promise<{ mediaId: string; cdnUrl: string; contentType: string }> {
  const requestRes = await api.uploads.requestUpload({
    purpose: 'space_media',
    contentType: file.type,
    contentLength: file.size,
    spaceId,
  });
  if (!requestRes.success || !requestRes.data) {
    throw new Error(
      (!requestRes.success && 'error' in requestRes ? requestRes.error?.message : null) ??
        'Failed to prepare upload',
    );
  }

  const { mediaId, uploadUrl, uploadFields, uploadHeaders } = requestRes.data;

  if (uploadHeaders) {
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: uploadHeaders,
      body: file,
      signal,
    });
    if (!putRes.ok) throw new Error('Upload failed');
  } else if (uploadFields) {
    const form = new FormData();
    for (const [k, v] of Object.entries(uploadFields)) form.append(k, v);
    form.append('file', file);
    const postRes = await fetch(uploadUrl, { method: 'POST', body: form, signal });
    if (!postRes.ok) throw new Error('Upload failed');
  } else {
    throw new Error('Upload configuration missing');
  }

  const completeRes = await api.uploads.completeUpload(mediaId);
  if (!completeRes.success) {
    throw new Error(
      (!completeRes.success && 'error' in completeRes ? completeRes.error?.message : null) ??
        'Failed to complete upload',
    );
  }

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const statusRes = await api.uploads.getStatus(mediaId);
    if (!statusRes.success || !statusRes.data) continue;
    const { status, cdnUrl } = statusRes.data;
    if (status === 'ready' && cdnUrl) {
      return { mediaId, cdnUrl, contentType: file.type };
    }
    if (status === 'rejected') {
      throw new Error(statusRes.data.rejectionReason ?? 'Content was rejected');
    }
    if (status === 'failed') {
      throw new Error('Processing failed');
    }
  }

  throw new Error('Processing timed out');
}

import { createApiClient } from '@adieuu/shared';
import { encrypt as encryptBytes, randomBytes, toBase64 } from '@adieuu/crypto';
import { convertShortcodes } from '../../utils/emojiShortcodes';
import { serializePayload, mediaPayload, buildCustomEmojiPayloadMap, parseCustomEmojiComposerSnapshot, type MentionEntity, type MediaAttachment } from '../messagePayload';
import { getOrCreateDeviceId } from '../deviceInfo';
import { stripExifMetadata } from '../../utils/imageProcessing';
import { withTimeout } from '../../utils/withTimeout';
import {
  isVisualMediaFile,
  prepareConversationMediaFileForUpload,
  uploadE2EMediaOnly,
  uploadModerationScanCopy,
  type ModerationScanPayload,
} from '../conversationMediaUploadFlow';
import type { MediaOutboxE2eSnapshotItem, MediaOutboxJobRecord, MediaOutboxPersistedScanPart } from './mediaOutboxTypes';
import {
  MEDIA_OUTBOX_ATTACHMENT_PIPELINE_TIMEOUT_MS,
  MEDIA_OUTBOX_PREPARE_TIMEOUT_MS,
} from './mediaOutboxConstants';
import { reportMediaOutboxTelemetry } from './mediaOutboxTelemetry';

export type MediaOutboxApi = ReturnType<typeof createApiClient>;

export interface MediaOutboxProcessDeps {
  api: MediaOutboxApi;
  abortSignal: AbortSignal;
  loadJob: (jobId: string) => Promise<MediaOutboxJobRecord | null>;
  saveJob: (job: MediaOutboxJobRecord) => Promise<void>;
  sendForOutbox: (
    conversationId: string,
    plaintext: string,
    options: {
      useForwardSecrecy?: boolean;
      replyToMessageId?: string;
      expiresInSeconds?: number;
      e2eMediaIds?: string[];
      moderationEnabled?: boolean;
      mentionedIdentityIds?: string[];
      signal?: AbortSignal;
    }
  ) => Promise<unknown>;
  toastScanFailed: () => void;
  t: (key: string, fallback: string, opts?: Record<string, unknown>) => string;
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

async function abandonOrphanE2ECreations(api: MediaOutboxApi, e2eMediaIds: string[]): Promise<void> {
  const unique = [...new Set(e2eMediaIds)];
  for (const id of unique) {
    try {
      const res = await api.e2eUploads.abandonE2EUpload(id);
      if (!res.success && res.error?.code !== 'NOT_FOUND') {
        console.warn('[MediaOutbox] abandon E2E failed', id, res.error);
      }
    } catch (e) {
      console.warn('[MediaOutbox] abandon E2E threw', id, e);
    }
  }
}

function toPersistedScan(
  m: ModerationScanPayload | ModerationScanPayload[]
): MediaOutboxPersistedScanPart | MediaOutboxPersistedScanPart[] {
  const one = (p: ModerationScanPayload): MediaOutboxPersistedScanPart => ({
    contentType: p.contentType,
    body: p.body,
  });
  return Array.isArray(m) ? m.map(one) : one(m);
}

function toModerationScanPayload(
  p: MediaOutboxPersistedScanPart | MediaOutboxPersistedScanPart[]
): ModerationScanPayload | ModerationScanPayload[] {
  const one = (x: MediaOutboxPersistedScanPart): ModerationScanPayload => ({
    contentType: x.contentType,
    body: x.body,
  });
  return Array.isArray(p) ? p.map(one) : one(p);
}

async function runE2eForAttachments(
  job: MediaOutboxJobRecord,
  deps: MediaOutboxProcessDeps,
  createdE2eIdsForAbandon: string[]
): Promise<MediaOutboxE2eSnapshotItem[]> {
  const { api, abortSignal, t } = deps;
  const out: MediaOutboxE2eSnapshotItem[] = [];

  for (let i = 0; i < job.attachmentBlobs.length; i++) {
    throwIfAborted(abortSignal);
    const att = job.attachmentBlobs[i]!;
    const rawFile = new File([att.blob], att.name, { type: att.type });
    const isVisual = isVisualMediaFile(rawFile);

    let fileToEncrypt: File;
    if (isVisual) {
      const preparedMedia = await withTimeout(
        prepareConversationMediaFileForUpload(rawFile, {
          signal: abortSignal,
          sendMp4WithoutReencode: job.sendMp4WithoutReencode === true,
        }),
        MEDIA_OUTBOX_PREPARE_TIMEOUT_MS,
        t(
          'conversations.mediaPrepareTimeout',
          'Video processing took too long. Check your connection or try a smaller file.',
        )
      );

      fileToEncrypt = preparedMedia;
      if (job.stripExif && preparedMedia.type.startsWith('image/')) {
        const stripped = await stripExifMetadata(preparedMedia);
        fileToEncrypt = new File([stripped], preparedMedia.name, {
          type: stripped.type || preparedMedia.type,
        });
      }
    } else {
      fileToEncrypt = rawFile;
    }

    const fileBytes = new Uint8Array(await fileToEncrypt.arrayBuffer());
    const mediaKey = randomBytes(32);
    const { ciphertext, nonce } = encryptBytes(mediaKey, fileBytes);
    const encryptedBlob = new Blob([ciphertext.buffer as ArrayBuffer], { type: 'application/octet-stream' });

    const e2eResult = await withTimeout(
      uploadE2EMediaOnly(api, fileToEncrypt, encryptedBlob, {
        stripExif: job.stripExif && fileToEncrypt.type.startsWith('image/'),
        signal: abortSignal,
        alreadyPrepared: true,
        skipModeration: job.moderationEnabled === false || !isVisual,
      }),
      MEDIA_OUTBOX_ATTACHMENT_PIPELINE_TIMEOUT_MS,
      t(
        'conversations.mediaAttachmentTimeout',
        'Processing this attachment took too long. Try again or use a smaller file.',
      )
    );

    const { moderationScan, ...result } = e2eResult;
    createdE2eIdsForAbandon.push(result.e2eMediaId);
    out.push({
      e2eMediaId: result.e2eMediaId,
      scanHash: result.scanHash,
      contentType: result.contentType,
      fileName: result.fileName,
      width: result.width,
      height: result.height,
      sizeBytes: result.sizeBytes,
      exifPreserved: result.exifPreserved,
      encryptionKey: toBase64(mediaKey),
      encryptionNonce: toBase64(nonce),
      ...(moderationScan ? { moderationScan: toPersistedScan(moderationScan) } : {}),
    });
    throwIfAborted(abortSignal);
  }

  return out;
}

async function sendMessageForJob(job: MediaOutboxJobRecord, deps: MediaOutboxProcessDeps): Promise<void> {
  const snap = job.e2eSnapshot;
  if (!snap?.length) throw new Error('Missing E2E snapshot');

  const mentions: MentionEntity[] = JSON.parse(job.mentionsJson) as MentionEntity[];
  const mediaAttachments: MediaAttachment[] = snap.map((m) => ({
    e2eMediaId: m.e2eMediaId,
    scanHash: m.scanHash,
    contentType: m.contentType,
    fileName: m.fileName,
    width: m.width,
    height: m.height,
    sizeBytes: m.sizeBytes,
    exifPreserved: m.exifPreserved,
    encryptionKey: m.encryptionKey,
    encryptionNonce: m.encryptionNonce,
  }));

  const mediaText = convertShortcodes(job.caption) || undefined;
  const snapshotList = parseCustomEmojiComposerSnapshot(job.composerCustomEmojisSnapshotJson);
  const customEmojiMap = buildCustomEmojiPayloadMap(mediaText ?? '', snapshotList, false);
  const payload = mediaPayload(mediaText, mediaAttachments);
  if (mentions.length > 0) payload.mentions = mentions;
  if (customEmojiMap && Object.keys(customEmojiMap).length > 0) {
    payload.customEmojis = customEmojiMap;
  }
  payload.senderDeviceId = getOrCreateDeviceId();
  const plaintext = serializePayload(payload);
  const e2eMediaIds = snap.map((m) => m.e2eMediaId);
  const mentionedIdentityIds =
    mentions.length > 0 ? [...new Set(mentions.map((m) => m.id))] : undefined;

  throwIfAborted(deps.abortSignal);

  const result = await deps.sendForOutbox(job.conversationId, plaintext, {
    useForwardSecrecy: job.useForwardSecrecy,
    ...(job.replyToMessageId ? { replyToMessageId: job.replyToMessageId } : {}),
    ...(job.ttlSeconds != null ? { expiresInSeconds: job.ttlSeconds } : {}),
    e2eMediaIds,
    moderationEnabled: job.moderationEnabled,
    mentionedIdentityIds,
    signal: deps.abortSignal,
  });

  if (result != null && typeof result === 'object' && 'errorCode' in result && result.errorCode === 'BLOCKED') {
    throw new Error(deps.t('conversations.sendBlocked', 'Message could not be sent'));
  }
  if (result == null || (typeof result === 'object' && 'errorCode' in result)) {
    throw new Error(deps.t('conversations.uploadFailed', 'Upload failed'));
  }
}

async function runScanUploads(job: MediaOutboxJobRecord, deps: MediaOutboxProcessDeps): Promise<void> {
  const { api, abortSignal, toastScanFailed, t } = deps;
  const snap = job.e2eSnapshot;
  if (!snap?.length) return;

  for (const item of snap) {
    if (!item.moderationScan) continue;
    throwIfAborted(abortSignal);
    try {
      await uploadModerationScanCopy(api, item.scanHash, toModerationScanPayload(item.moderationScan), {
        signal: abortSignal,
      });
    } catch (err) {
      console.error('[MediaOutbox] Moderation scan upload failed', err);
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      toastScanFailed();
      throw err instanceof Error ? err : new Error(t('conversations.uploadFailed', 'Upload failed'));
    }
  }
}

/**
 * Runs one outbox job to completion (or failure / cancel), updating the persisted row via {@link MediaOutboxProcessDeps.saveJob}.
 */
export async function processMediaOutboxJob(jobId: string, deps: MediaOutboxProcessDeps): Promise<void> {
  let job = await deps.loadJob(jobId);
  if (!job) return;
  if (job.stage === 'cancelled' || job.stage === 'completed' || job.stage === 'failed') return;

  const conversationId = job.conversationId;
  const createdE2eIdsForAbandon: string[] = [];
  const startedAt = job.createdAt;

  const now = () => Date.now();

  const patch = async (partial: Partial<MediaOutboxJobRecord>): Promise<MediaOutboxJobRecord | null> => {
    const latest = await deps.loadJob(jobId);
    if (!latest) return null;
    if (latest.stage === 'cancelled') return null;
    const next: MediaOutboxJobRecord = { ...latest, ...partial, updatedAt: now() };
    await deps.saveJob(next);
    return next;
  };

  try {
    if (!job.messageSendCompleted) {
      if (!job.e2eSnapshot?.length) {
        const p1 = await patch({ stage: 'preparing' });
        if (!p1) return;
        job = p1;
        throwIfAborted(deps.abortSignal);

        const snapshot = await runE2eForAttachments(job, deps, createdE2eIdsForAbandon);
        const p2 = await patch({
          e2eSnapshot: snapshot,
          attachmentBlobs: [],
          stage: 'sending',
        });
        if (!p2) return;
        job = p2;
      } else {
        const p3 = await patch({ stage: 'sending' });
        if (!p3) return;
        job = p3;
      }

      throwIfAborted(deps.abortSignal);
      // D1: Message `createdAt` is assigned by the API when this send completes (after E2E upload),
      // not when the user first enqueued the outbox job.
      await sendMessageForJob(job, deps);

      const p4 = await patch({
        messageSendCompleted: true,
        stage: 'scan_upload',
      });
      if (!p4) return;
      job = p4;
    }

    if (job.moderationEnabled !== false) {
      const p5 = await patch({ stage: 'scan_upload' });
      if (!p5) return;
      job = p5;
      throwIfAborted(deps.abortSignal);
      await runScanUploads(job, deps);
    }

    await patch({ stage: 'completed', errorMessage: undefined });
    reportMediaOutboxTelemetry({
      kind: 'job_completed',
      jobId,
      conversationId,
      durationMs: Math.max(0, now() - startedAt),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      const latest = await deps.loadJob(jobId);
      if (latest && latest.messageSendCompleted !== true) {
        const fromSnap = latest.e2eSnapshot?.map((x) => x.e2eMediaId) ?? [];
        const ids = [...new Set([...fromSnap, ...createdE2eIdsForAbandon])];
        await abandonOrphanE2ECreations(deps.api, ids);
      }
      await patch({ stage: 'cancelled', errorMessage: undefined });
      reportMediaOutboxTelemetry({
        kind: 'job_cancelled',
        jobId,
        conversationId,
        durationMs: Math.max(0, now() - startedAt),
      });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed';
    await patch({ stage: 'failed', errorMessage: msg });
    reportMediaOutboxTelemetry({
      kind: 'job_failed',
      jobId,
      conversationId,
      durationMs: Math.max(0, now() - startedAt),
      errorMessage: msg,
    });
  }
}

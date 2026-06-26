/**
 * Upload controller — validation and upload service orchestration.
 *
 * Route modules map structured results to HTTP responses.
 *
 * @module routes/uploads/controller
 */

import type { SubscriptionTierId } from '@adieuu/shared';
import { z } from '@adieuu/shared/schemas';
import { config } from '../../config';
import type { UploadPurpose } from '../../models/media-upload';
import {
  requestUpload,
  completeUpload,
  getUploadStatus,
  processCallback,
} from '../../services/upload.service';

export const RequestUploadSchema = z.object({
  purpose: z.enum(['avatar', 'banner', 'dm_attachment', 'space_media', 'custom_emoji', 'ticket_attachment', 'feedback_attachment']),
  contentType: z.string().min(1).max(100),
  contentLength: z.number().int().positive(),
});

export const ProcessCallbackSchema = z.object({
  mediaId: z.string().min(1).max(200),
  status: z.enum(['ready', 'rejected', 'failed']),
  processedS3Key: z.string().max(500).optional(),
  rejectionReason: z.string().max(500).optional(),
});

export type UploadFailureKind =
  | 'validation_failed'
  | 'bad_request'
  | 'not_found'
  | 'rate_limited'
  | 'unauthorized';

export type UploadResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; kind: UploadFailureKind; message?: string };

export type ParseMediaIdResult =
  | { ok: true; mediaId: string }
  | { ok: false; kind: 'bad_request' };

const MAX_MEDIA_ID_LENGTH = 100;

export function parseMediaId(raw: string | undefined): ParseMediaIdResult {
  if (!raw || raw.length > MAX_MEDIA_ID_LENGTH) {
    return { ok: false, kind: 'bad_request' };
  }
  return { ok: true, mediaId: raw };
}

export type RequestUploadSession =
  | {
      type: 'identity';
      identityId: string;
      subscriptions?: SubscriptionTierId[];
      entitlements?: string[];
      isLifetime?: boolean;
    }
  | {
      type: 'account';
      userId: string;
    };

export type UploadOwner =
  | { type: 'identity'; id: string }
  | { type: 'account'; id: string };

export type RequestUploadData = {
  mediaId: string;
  uploadUrl: string;
  expiresIn: number;
  uploadFields?: Record<string, string>;
  uploadHeaders?: Record<string, string>;
};

export async function requestUploadResult(
  session: RequestUploadSession,
  body: unknown,
  clientIp?: string,
): Promise<UploadResult<RequestUploadData>> {
  const parseResult = RequestUploadSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const result = await requestUpload({
    purpose: parseResult.data.purpose as UploadPurpose,
    contentType: parseResult.data.contentType,
    contentLength: parseResult.data.contentLength,
    ...(session.type === 'identity'
      ? {
          identityId: session.identityId,
          subscriptions: session.subscriptions,
          entitlements: session.entitlements,
          isLifetime: session.isLifetime,
        }
      : { userId: session.userId }),
    clientIp,
  });

  if (!result.success) {
    if (result.errorCode === 'RATE_LIMITED') {
      return { ok: false, kind: 'rate_limited', message: result.error };
    }
    return { ok: false, kind: 'bad_request', message: result.error };
  }

  if (!result.mediaId || !result.uploadUrl || (!result.uploadFields && !result.uploadHeaders) || result.expiresIn === undefined) {
    return { ok: false, kind: 'bad_request', message: 'Upload request failed' };
  }

  return {
    ok: true,
    data: {
      mediaId: result.mediaId,
      uploadUrl: result.uploadUrl,
      expiresIn: result.expiresIn,
      uploadFields: result.uploadFields,
      uploadHeaders: result.uploadHeaders,
    },
  };
}

export async function completeUploadResult(
  owner: UploadOwner,
  rawMediaId: string | undefined,
): Promise<UploadResult<undefined>> {
  const idParsed = parseMediaId(rawMediaId);
  if (!idParsed.ok) {
    return { ok: false, kind: 'bad_request' };
  }

  const result = await completeUpload(idParsed.mediaId, owner);
  if (!result.success) {
    if (result.errorCode === 'NOT_FOUND') {
      return { ok: false, kind: 'not_found', message: result.error };
    }
    return { ok: false, kind: 'bad_request', message: result.error };
  }

  return { ok: true, data: undefined };
}

export type UploadStatusData = {
  mediaId: string;
  status: string;
  cdnUrl: string | null;
  rejectionReason: string | null;
};

export async function getUploadStatusResult(
  owner: UploadOwner,
  rawMediaId: string | undefined,
): Promise<UploadResult<UploadStatusData>> {
  const idParsed = parseMediaId(rawMediaId);
  if (!idParsed.ok) {
    return { ok: false, kind: 'bad_request' };
  }

  const doc = await getUploadStatus(idParsed.mediaId, owner);
  if (!doc) {
    return { ok: false, kind: 'not_found', message: 'Upload not found' };
  }

  return {
    ok: true,
    data: {
      mediaId: doc.mediaId,
      status: doc.status,
      cdnUrl: doc.cdnUrl ?? null,
      rejectionReason: doc.rejectionReason ?? null,
    },
  };
}

export async function processCallbackResult(
  processorSecret: string | null,
  body: unknown,
): Promise<UploadResult<undefined>> {
  if (!processorSecret || processorSecret !== config.mediaProcessorSecret) {
    return { ok: false, kind: 'unauthorized', message: 'Invalid processor secret' };
  }

  const parseResult = ProcessCallbackSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, kind: 'bad_request', message: 'Invalid callback payload' };
  }

  const { mediaId, status, processedS3Key, rejectionReason } = parseResult.data;
  const ok = await processCallback(mediaId, status, processedS3Key, rejectionReason);
  if (!ok) {
    return { ok: false, kind: 'not_found', message: 'Upload not found' };
  }

  return { ok: true, data: undefined };
}

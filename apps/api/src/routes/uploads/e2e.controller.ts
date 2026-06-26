/**
 * E2E upload controller — validation and e2e-upload service orchestration.
 *
 * Route modules map structured results to HTTP responses.
 *
 * @module routes/uploads/e2e.controller
 */

import type { SubscriptionTierId } from '@adieuu/shared';
import { z } from '@adieuu/shared/schemas';
import { VIDEO_MIME_TYPES } from '../../models/media-upload';
import type { E2EMediaStatusResult } from '../../services/e2e-upload.service';
import {
  requestE2EUpload,
  completeE2EUpload,
  abandonE2EUpload,
  getE2EMediaStatus,
  getE2EMediaDownload,
  requestScanUpload,
  completeScanUpload,
  sealConvScanUploadSession,
} from '../../services/e2e-upload.service';
import { parseMediaId } from './controller';

export const RequestE2EUploadSchema = z
  .object({
    contentType: z.string().min(1).max(100),
    contentLength: z.number().int().positive(),
    stripExif: z.boolean().default(true),
    declaredDurationSeconds: z.number().positive().optional(),
  })
  .superRefine((data, ctx) => {
    const isVideo = (VIDEO_MIME_TYPES as readonly string[]).includes(data.contentType);
    if (isVideo && data.declaredDurationSeconds === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'declaredDurationSeconds is required for video content types',
        path: ['declaredDurationSeconds'],
      });
    }
  });

export const CompleteE2EUploadSchema = z
  .object({
    skipModeration: z.boolean().optional(),
  })
  .optional();

export const RequestScanUploadSchema = z.object({
  scanHash: z.string().length(64),
  contentType: z.string().min(1).max(100),
  contentLength: z.number().int().positive(),
});

const ConvScanManifestPartSchema = z.object({
  mediaId: z.string().min(1).max(120),
  contentSha256: z.string().length(64).regex(/^[0-9a-f]+$/i).optional(),
});

const ConvScanManifestSchema = z.object({
  version: z.literal(1),
  parts: z.array(ConvScanManifestPartSchema).min(1).max(32),
});

export const SealConvScanSessionSchema = z.object({
  scanHash: z.string().length(64),
  scanMediaIds: z.array(z.string().min(1).max(120)).max(64).optional(),
  manifest: ConvScanManifestSchema.optional(),
});

export type E2eUploadFailureKind =
  | 'validation_failed'
  | 'bad_request'
  | 'not_found'
  | 'rate_limited'
  | 'forbidden'
  | 'conflict'
  | 'scan_pending'
  | 'rejected'
  | 'moderation_error';

export type E2eUploadResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; kind: E2eUploadFailureKind; message?: string; moderationReason?: string };

export type RequestE2EUploadSession = {
  identityId: string;
  maxVideoDurationSeconds: number;
  subscriptions?: SubscriptionTierId[];
  entitlements?: string[];
  isLifetime?: boolean;
};

export type RequestE2EUploadData = {
  e2eMediaId: string;
  uploadUrl: string;
  scanHash: string;
  expiresIn: number;
  uploadHeaders?: Record<string, string>;
};

export async function requestE2EUploadResult(
  session: RequestE2EUploadSession,
  body: unknown,
): Promise<E2eUploadResult<RequestE2EUploadData>> {
  const parseResult = RequestE2EUploadSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const result = await requestE2EUpload({
    contentType: parseResult.data.contentType,
    contentLength: parseResult.data.contentLength,
    identityId: session.identityId,
    stripExif: parseResult.data.stripExif,
    maxVideoDurationSeconds: session.maxVideoDurationSeconds,
    declaredDurationSeconds: parseResult.data.declaredDurationSeconds,
    subscriptions: session.subscriptions,
    entitlements: session.entitlements,
    isLifetime: session.isLifetime,
  });

  if (!result.success) {
    if (result.errorCode === 'RATE_LIMITED') {
      return { ok: false, kind: 'rate_limited', message: result.error };
    }
    return { ok: false, kind: 'bad_request', message: result.error };
  }

  if (!result.e2eMediaId || !result.uploadUrl || !result.scanHash || result.expiresIn === undefined) {
    return { ok: false, kind: 'bad_request', message: 'E2E upload request failed' };
  }

  return {
    ok: true,
    data: {
      e2eMediaId: result.e2eMediaId,
      uploadUrl: result.uploadUrl,
      scanHash: result.scanHash,
      expiresIn: result.expiresIn,
      ...(result.uploadHeaders ? { uploadHeaders: result.uploadHeaders } : {}),
    },
  };
}

export async function completeE2EUploadResult(
  identityId: string,
  rawMediaId: string | undefined,
  body: unknown,
): Promise<E2eUploadResult<undefined>> {
  const idParsed = parseMediaId(rawMediaId);
  if (!idParsed.ok) {
    return { ok: false, kind: 'bad_request' };
  }

  const bodyParsed = CompleteE2EUploadSchema.safeParse(body);
  const skipModeration = bodyParsed.success ? bodyParsed.data?.skipModeration : undefined;

  const result = await completeE2EUpload(idParsed.mediaId, identityId, {
    skipModeration: skipModeration === true,
  });

  if (!result.success) {
    if (result.errorCode === 'NOT_FOUND') {
      return { ok: false, kind: 'not_found', message: result.error };
    }
    return { ok: false, kind: 'bad_request', message: result.error };
  }

  return { ok: true, data: undefined };
}

export async function abandonE2EUploadResult(
  identityId: string,
  rawMediaId: string | undefined,
): Promise<E2eUploadResult<undefined>> {
  const idParsed = parseMediaId(rawMediaId);
  if (!idParsed.ok) {
    return { ok: false, kind: 'bad_request' };
  }

  const result = await abandonE2EUpload(idParsed.mediaId, identityId);
  if (!result.success) {
    switch (result.errorCode) {
      case 'NOT_FOUND':
        return { ok: false, kind: 'not_found', message: result.error };
      case 'REFERENCED':
        return {
          ok: false,
          kind: 'conflict',
          message: result.error ?? 'E2E media is referenced by a message',
        };
      default:
        return { ok: false, kind: 'bad_request', message: result.error };
    }
  }

  return { ok: true, data: undefined };
}

export async function getE2EMediaStatusResult(
  identityId: string,
  rawMediaId: string | undefined,
): Promise<E2eUploadResult<E2EMediaStatusResult>> {
  const idParsed = parseMediaId(rawMediaId);
  if (!idParsed.ok) {
    return { ok: false, kind: 'bad_request' };
  }

  const result = await getE2EMediaStatus(idParsed.mediaId, identityId);
  if (!result) {
    return { ok: false, kind: 'not_found', message: 'E2E media not found' };
  }

  return { ok: true, data: result };
}

export type E2EMediaDownloadData = {
  downloadUrl: string;
  expiresIn: number;
};

export async function getE2EMediaDownloadResult(
  identityId: string,
  rawMediaId: string | undefined,
): Promise<E2eUploadResult<E2EMediaDownloadData>> {
  const idParsed = parseMediaId(rawMediaId);
  if (!idParsed.ok) {
    return { ok: false, kind: 'bad_request' };
  }

  const result = await getE2EMediaDownload(idParsed.mediaId, identityId);
  if (!result.success) {
    switch (result.errorCode) {
      case 'NOT_FOUND':
        return { ok: false, kind: 'not_found', message: result.error };
      case 'REJECTED':
        return {
          ok: false,
          kind: 'rejected',
          message: result.error ?? 'Content has been rejected by moderation',
          moderationReason: result.moderationReason,
        };
      case 'MODERATION_ERROR':
        return {
          ok: false,
          kind: 'moderation_error',
          message: result.error ?? 'Content moderation scan encountered an error',
        };
      case 'SCAN_PENDING':
        return {
          ok: false,
          kind: 'scan_pending',
          message: result.error ?? 'Content is awaiting moderation scan',
        };
      default:
        return { ok: false, kind: 'bad_request', message: result.error };
    }
  }

  if (!result.downloadUrl || result.expiresIn === undefined) {
    return { ok: false, kind: 'bad_request', message: 'Download unavailable' };
  }

  return {
    ok: true,
    data: {
      downloadUrl: result.downloadUrl,
      expiresIn: result.expiresIn,
    },
  };
}

export type RequestScanUploadData = {
  scanMediaId: string;
  uploadUrl: string;
  expiresIn: number;
  uploadFields?: Record<string, string>;
  uploadHeaders?: Record<string, string>;
};

export async function requestScanUploadResult(
  identityId: string,
  body: unknown,
  clientIp?: string,
): Promise<E2eUploadResult<RequestScanUploadData>> {
  const parseResult = RequestScanUploadSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const result = await requestScanUpload({
    scanHash: parseResult.data.scanHash,
    contentType: parseResult.data.contentType,
    contentLength: parseResult.data.contentLength,
    identityId,
    clientIp,
  });

  if (!result.success) {
    switch (result.errorCode) {
      case 'RATE_LIMITED':
        return { ok: false, kind: 'rate_limited', message: result.error };
      case 'SCAN_SESSION_NOT_FOUND':
        return { ok: false, kind: 'not_found', message: result.error };
      case 'FORBIDDEN':
        return { ok: false, kind: 'forbidden', message: result.error ?? 'Forbidden' };
      default:
        return { ok: false, kind: 'bad_request', message: result.error };
    }
  }

  if (!result.scanMediaId || !result.uploadUrl || (!result.uploadFields && !result.uploadHeaders) || result.expiresIn === undefined) {
    return { ok: false, kind: 'bad_request', message: 'Scan upload request failed' };
  }

  return {
    ok: true,
    data: {
      scanMediaId: result.scanMediaId,
      uploadUrl: result.uploadUrl,
      expiresIn: result.expiresIn,
      uploadFields: result.uploadFields,
      uploadHeaders: result.uploadHeaders,
    },
  };
}

export async function completeScanUploadResult(
  identityId: string,
  rawMediaId: string | undefined,
): Promise<E2eUploadResult<undefined>> {
  const idParsed = parseMediaId(rawMediaId);
  if (!idParsed.ok) {
    return { ok: false, kind: 'bad_request' };
  }

  const result = await completeScanUpload(idParsed.mediaId, { identityId });
  if (!result.success) {
    if (result.errorCode === 'NOT_FOUND') {
      return { ok: false, kind: 'not_found', message: result.error };
    }
    return { ok: false, kind: 'bad_request', message: result.error };
  }

  return { ok: true, data: undefined };
}

export async function sealConvScanUploadResult(
  identityId: string,
  body: unknown,
): Promise<E2eUploadResult<undefined>> {
  const parseResult = SealConvScanSessionSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const result = await sealConvScanUploadSession({
    scanHash: parseResult.data.scanHash,
    identityId,
    scanMediaIds: parseResult.data.scanMediaIds,
    manifest: parseResult.data.manifest,
  });

  if (!result.success) {
    switch (result.errorCode) {
      case 'NOT_FOUND':
        return { ok: false, kind: 'not_found', message: result.error };
      case 'FORBIDDEN':
        return { ok: false, kind: 'forbidden', message: result.error ?? 'Forbidden' };
      default:
        return { ok: false, kind: 'bad_request', message: result.error };
    }
  }

  return { ok: true, data: undefined };
}

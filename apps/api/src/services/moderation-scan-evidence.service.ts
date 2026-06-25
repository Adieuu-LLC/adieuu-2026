/**
 * Presigned GET URLs for conv_scan cleartext tied to automated moderation reports.
 */

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Filter } from 'mongodb';
import { ObjectId } from 'mongodb';
import { config } from '../config';
import type { MediaUploadDocument, UploadPurpose } from '../models/media-upload';
import type { ReportDocument } from '../models/report';
import { getMediaUploadRepository } from '../repositories/media-upload.repository';
import { getReportRepository } from '../repositories/report.repository';
import elog from '../utils/adieuuLogger';
import {
  isCloudFrontSigningEnabled,
  generateCloudFrontSignedUrl,
} from '../utils/cloudfront-signer';

const PRESIGNED_GET_EXPIRY_SECONDS = 900; // 15 minutes

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.s3.region,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return s3Client;
}

function scanHashFromReport(report: ReportDocument): string | undefined {
  const dm = report.detectionMetadata;
  if (!dm || typeof dm !== 'object' || typeof dm.scanHash !== 'string') return undefined;
  const h = dm.scanHash;
  return /^[0-9a-f]{64}$/i.test(h) ? h.toLowerCase() : undefined;
}

function isRenderableEvidenceKey(s3Key: string): boolean {
  if (s3Key.endsWith('/.sealed') || s3Key.endsWith('/manifest.json')) return false;
  return true;
}

export interface ModerationScanEvidenceItem {
  mediaId: string;
  contentType: string;
  downloadUrl: string;
}

export interface ModerationScanEvidenceResult {
  expiresInSeconds: number;
  items: ModerationScanEvidenceItem[];
}

export type ModerationScanEvidenceErrorCode =
  | 'NOT_FOUND'
  | 'NO_SCAN_HASH'
  | 'UPLOAD_DISABLED';

/**
 * Build short-lived presigned URLs for all conv_scan objects under the report's scan session.
 * Caller must enforce moderator authentication.
 */
export async function getModerationScanEvidenceForReport(
  reportId: string | ObjectId
): Promise<
  | { ok: true; data: ModerationScanEvidenceResult }
  | { ok: false; errorCode: ModerationScanEvidenceErrorCode; message: string }
> {
  if (!config.s3.mediaBucket) {
    return {
      ok: false,
      errorCode: 'UPLOAD_DISABLED',
      message: 'Media bucket is not configured',
    };
  }

  const reportRepo = getReportRepository();
  const report = await reportRepo.findById(reportId);
  if (!report) {
    return { ok: false, errorCode: 'NOT_FOUND', message: 'Report not found' };
  }

  const scanHash = scanHashFromReport(report);
  if (!scanHash) {
    return {
      ok: false,
      errorCode: 'NO_SCAN_HASH',
      message: 'Report has no scan session (detectionMetadata.scanHash)',
    };
  }

  const mediaRepo = getMediaUploadRepository();
  const docs = await mediaRepo.findMany(
    {
      scanHash,
      purpose: 'conv_scan' as UploadPurpose,
    } as Filter<MediaUploadDocument>,
    64
  );

  const candidates = docs
    .filter((d) => d.s3Key && isRenderableEvidenceKey(d.s3Key))
    .filter((d) => d.contentType.startsWith('image/') || d.contentType.startsWith('video/'))
    .sort((a, b) => a.mediaId.localeCompare(b.mediaId));

  const client = getS3Client();
  const useCf = isCloudFrontSigningEnabled();
  const items: ModerationScanEvidenceItem[] = [];

  for (const doc of candidates) {
    try {
      let downloadUrl: string;
      if (useCf) {
        downloadUrl = generateCloudFrontSignedUrl({
          s3Key: doc.s3Key,
          distribution: 'media',
          expiresInSeconds: PRESIGNED_GET_EXPIRY_SECONDS,
        });
      } else {
        const command = new GetObjectCommand({
          Bucket: config.s3.mediaBucket,
          Key: doc.s3Key,
          ResponseContentType: doc.contentType,
          ResponseContentDisposition: 'inline',
        });
        downloadUrl = await getSignedUrl(client, command, {
          expiresIn: PRESIGNED_GET_EXPIRY_SECONDS,
        });
      }
      items.push({
        mediaId: doc.mediaId,
        contentType: doc.contentType,
        downloadUrl,
      });
    } catch (err) {
      elog.error('Moderation scan evidence presign failed', {
        err,
        mediaId: doc.mediaId,
        scanHash,
      });
    }
  }

  return {
    ok: true,
    data: {
      expiresInSeconds: PRESIGNED_GET_EXPIRY_SECONDS,
      items,
    },
  };
}

/**
 * Builds a CyberTipline report payload from internal platform data.
 *
 * Gathers data from the platform report, identity collection, and media uploads
 * to produce the typed input for the CyberTipline API client.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import { getIdentityRepository } from '../repositories/identity.repository';
import { getMediaUploadRepository } from '../repositories/media-upload.repository';
import type { ReportDocument } from '../models/report';
import type {
  CyberTiplineReportInput,
  CyberTiplineFileDetailsInput,
  CyberTiplineIpCapture,
} from './cybertipline.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CyberTiplineReportBundle {
  report: CyberTiplineReportInput;
  evidenceFile?: {
    data: Buffer;
    fileName: string;
    details: Omit<CyberTiplineFileDetailsInput, 'reportId' | 'fileId'>;
  };
}

interface DetectionMeta {
  rejectionReason?: string;
  mediaId?: string;
  scanHash?: string;
  e2eMatched?: boolean;
  csamMatches?: Array<{
    source: string;
    hashType: string;
    matchedHash: string;
    matchType: string;
    classification?: string;
    matchDetails?: Record<string, unknown>;
  }>;
  evidenceBucket?: string;
  evidenceKey?: string;
  uploadIpAddress?: string;
  detectedAt?: string;
  contentType?: string;
  contentLength?: number;
}

// ---------------------------------------------------------------------------
// S3 client (reused across calls)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

const INCIDENT_TYPE_CSAM = 'Child Pornography (possession, manufacture, and distribution)';

export async function buildCyberTiplineReport(
  platformReport: ReportDocument,
  moderatorNotes?: string,
): Promise<CyberTiplineReportBundle> {
  const meta = (platformReport.detectionMetadata ?? {}) as DetectionMeta;

  const identityRepo = getIdentityRepository();
  const mediaRepo = getMediaUploadRepository();

  const [identity, mediaUpload] = await Promise.all([
    platformReport.targetIdentityId
      ? identityRepo.findByIdentityId(platformReport.targetIdentityId)
      : null,
    meta.mediaId
      ? mediaRepo.findByMediaId(meta.mediaId)
      : null,
  ]);

  const uploadIp = meta.uploadIpAddress;
  const uploadTime = mediaUpload?.createdAt instanceof Date
    ? mediaUpload.createdAt.toISOString()
    : undefined;

  const ipCapture: CyberTiplineIpCapture | undefined = uploadIp
    ? { ipAddress: uploadIp, eventName: 'Upload', dateTime: uploadTime }
    : undefined;

  const matchSummaryLines = (meta.csamMatches ?? []).map((m, i) =>
    `Match ${i + 1}: source=${m.source}, hashType=${m.hashType}, hash=${m.matchedHash}, type=${m.matchType}` +
    (m.classification ? `, classification=${m.classification}` : '') +
    (m.matchDetails ? `, details=${JSON.stringify(m.matchDetails)}` : ''),
  );

  const additionalNotes = [
    moderatorNotes ? `Moderator notes: ${moderatorNotes}` : '',
    `Internal report ID: ${platformReport._id?.toHexString?.() ?? String(platformReport._id)}`,
    `Detection source(s): ${(meta.csamMatches ?? []).map(m => m.source).join(', ') || 'unknown'}`,
    ...matchSummaryLines,
    meta.evidenceBucket ? `Evidence archived to: ${meta.evidenceBucket}/${meta.evidenceKey}` : '',
  ].filter(Boolean).join('\n');

  const report: CyberTiplineReportInput = {
    incidentType: INCIDENT_TYPE_CSAM,
    incidentDateTime: meta.detectedAt ?? new Date().toISOString(),
    reportedPerson: {
      espIdentifier: platformReport.targetIdentityId,
      screenName: identity?.username,
      displayName: identity?.displayName,
      bio: identity?.bio,
      ipCaptureEvents: ipCapture ? [ipCapture] : undefined,
      permanentlyDisabled: identity?.isBanned === true ? true : undefined,
      permanentlyDisabledDate: identity?.isBanned
        ? (identity.updatedAt instanceof Date ? identity.updatedAt.toISOString() : undefined)
        : undefined,
    },
    additionalNotes,
  };

  let evidenceFile: CyberTiplineReportBundle['evidenceFile'] | undefined;

  if (meta.evidenceBucket && meta.evidenceKey) {
    try {
      const s3 = getS3Client();
      const cmd = new GetObjectCommand({
        Bucket: meta.evidenceBucket,
        Key: meta.evidenceKey,
      });
      const s3Resp = await s3.send(cmd);

      if (s3Resp.Body) {
        const bodyBytes = await s3Resp.Body.transformToByteArray();
        const fileName = meta.evidenceKey.split('/').pop() ?? 'evidence';

        const firstMatch = meta.csamMatches?.[0];

        const fileDetails: Omit<CyberTiplineFileDetailsInput, 'reportId' | 'fileId'> = {
          originalFileName: fileName,
          uploadedDateTime: uploadTime,
          ipCaptureEvent: ipCapture,
          viewedByEsp: false,
          originalHash: firstMatch
            ? { hashType: firstMatch.hashType, hashValue: firstMatch.matchedHash }
            : undefined,
          additionalInfo: matchSummaryLines.length > 0
            ? `Hash match details:\n${matchSummaryLines.join('\n')}`
            : undefined,
        };

        evidenceFile = {
          data: Buffer.from(bodyBytes),
          fileName,
          details: fileDetails,
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.additionalNotes += `\n\nWARNING: Failed to retrieve evidence file from S3: ${msg}`;
    }
  }

  return { report, evidenceFile };
}

/**
 * After an automated hash-check report is resolved or closed, eradicate retained conv_scan cleartext.
 */

import { S3Client } from '@aws-sdk/client-s3';
import { config } from '../config';
import type { ReportDocument } from '../models/report';
import { purgeConvScanCleartextArtifacts } from '../utils/conv-scan-purge';
import elog from '../utils/adieuuLogger';

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

export async function purgeConvScanEvidenceForTerminalReport(report: ReportDocument): Promise<void> {
  if (report.source !== 'automated_hash_check') return;

  const dm = report.detectionMetadata;
  const scanHash =
    dm && typeof dm === 'object' && typeof dm.scanHash === 'string' ? dm.scanHash : undefined;
  if (!scanHash || scanHash.length !== 64) return;

  try {
    await purgeConvScanCleartextArtifacts(scanHash, {
      removeDbRows: true,
      s3Client: getS3Client(),
      mediaBucket: config.s3.mediaBucket,
    });
  } catch (err) {
    elog.error('Failed to purge conv_scan after terminal report', {
      err,
      reportId: report._id,
      scanHash,
    });
  }
}

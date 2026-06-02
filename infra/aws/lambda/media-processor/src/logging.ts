/**
 * Structured JSON logs for CloudWatch (one JSON object per line).
 */

export interface ProcessorLogFields {
  event: string;
  mediaId?: string;
  purpose?: string;
  s3Key?: string;
  dbWriterStatus?: 'ready' | 'rejected' | 'failed';
  dbWriterInvokeError?: string;
  dbWriterFunctionError?: string;
  error?: string;
  matchCount?: number;
  matchSources?: string;
  evidenceBucket?: string;
  evidenceKey?: string;
  batchScanHash?: string;
  scanHash?: string;
  keyCount?: number;
  videoCount?: number;
  imageCount?: number;
}

export function logProcessorEvent(fields: ProcessorLogFields): void {
  console.log(JSON.stringify({ ...fields, source: 'media-processor' }));
}

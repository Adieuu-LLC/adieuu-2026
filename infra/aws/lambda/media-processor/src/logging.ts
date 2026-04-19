/**
 * Structured JSON logs for CloudWatch (one JSON object per line).
 */

export interface ProcessorLogFields {
  event: string;
  mediaId?: string;
  purpose?: string;
  s3Key?: string;
  contentModeration?: boolean;
  moderationLabelCount?: number;
  topLabel?: string;
  dbWriterStatus?: 'ready' | 'rejected' | 'failed';
  dbWriterInvokeError?: string;
  dbWriterFunctionError?: string;
  rekognitionError?: string;
}

export function logProcessorEvent(fields: ProcessorLogFields): void {
  console.log(JSON.stringify({ ...fields, source: 'media-processor' }));
}

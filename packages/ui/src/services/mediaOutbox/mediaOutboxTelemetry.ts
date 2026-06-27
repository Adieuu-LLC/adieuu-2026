/**
 * Optional hook for product analytics / observability (Phase D metrics).
 * Default is no-op; host apps can register a sink (e.g. OpenTelemetry, internal pipeline).
 */

export type MediaOutboxTelemetryEvent =
  | {
      kind: 'job_completed';
      jobId: string;
      conversationId: string;
      durationMs: number;
    }
  | {
      kind: 'job_failed';
      jobId: string;
      conversationId: string;
      durationMs: number;
      errorMessage: string;
    }
  | {
      kind: 'job_cancelled';
      jobId: string;
      conversationId: string;
      durationMs: number;
    };

type Sink = (event: MediaOutboxTelemetryEvent) => void;

let sink: Sink | undefined;

export function setMediaOutboxTelemetrySink(next: Sink | undefined): void {
  sink = next;
}

export function reportMediaOutboxTelemetry(event: MediaOutboxTelemetryEvent): void {
  try {
    sink?.(event);
  } catch {
    /* telemetry must never break sends */
  }
}

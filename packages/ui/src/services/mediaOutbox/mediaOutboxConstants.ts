/**
 * Tunable media outbox behaviour (queue, IndexedDB, timeouts).
 * Adjust here for performance experiments or product limits.
 */

/**
 * Max concurrent media outbox pipelines app-wide (prepare + E2E + send + scan).
 * Phase C target: allow more than one pending send without saturating low-power devices.
 */
export const MEDIA_OUTBOX_MAX_CONCURRENT_JOBS = 2;

export const MEDIA_OUTBOX_IDB_NAME = 'adieuu-media-outbox';
export const MEDIA_OUTBOX_IDB_VERSION = 1;
export const MEDIA_OUTBOX_IDB_STORE = 'jobs';

/**
 * How long to retain a terminal job row before hard delete (ms).
 * 0 = delete as soon as the job reaches completed (not shown in UI).
 */
export const MEDIA_OUTBOX_COMPLETED_RETENTION_MS = 0;

/** Covers ffmpeg load/transcode; mirrors composer media prepare. */
export const MEDIA_OUTBOX_PREPARE_TIMEOUT_MS = 5 * 60 * 1000;

/** Whole attachment: transcode + encrypt + E2E upload on slow networks. */
export const MEDIA_OUTBOX_ATTACHMENT_PIPELINE_TIMEOUT_MS = 30 * 60 * 1000;

/** Debounce between queue pump retries when no work was available (ms). */
export const MEDIA_OUTBOX_PUMP_COOLDOWN_MS = 50;

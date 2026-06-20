/**
 * Client-side crash reporter.
 *
 * Three responsibilities:
 * 1. Register global `error` and `unhandledrejection` listeners to catch
 *    exceptions that escape the React tree.
 * 2. Deduplicate and rate-limit captured errors within a session.
 * 3. Submit crash reports to the backend via raw `fetch()` (the app's
 *    ApiClient may itself be broken when a crash occurs).
 *
 * Call `crashReporter.init()` **before** `createRoot()` so even errors
 * during the initial render are captured.
 *
 * Reporting is opt-in: nothing leaves the device unless the user has enabled
 * the "Send anonymous crash reports" preference in Privacy & Security.
 */

import {
  getCrashReportingEnabled,
  getCrashReportingIncludeUser,
} from '../hooks/crashReportingPreferenceStorage';

export interface CrashReportContactInfo {
  type: 'account' | 'alias';
  identifier: string;
}

export interface CrashReportPayload {
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  platform: 'web' | 'desktop' | 'mobile';
  userAgent: string;
  appVersion?: string;
  userDescription?: string;
  contactInfo?: CrashReportContactInfo;
  timestamp: string;
}

const MAX_ERRORS_PER_SESSION = 25;
const AUTO_SUBMIT_DEBOUNCE_MS = 2_000;
const FINGERPRINT_SEP = '\n---\n';

let endpoint: string | null = null;
let platform: CrashReportPayload['platform'] = 'web';
let appVersion: string | undefined;
let initialized = false;

let userContext: CrashReportContactInfo | null = null;

const seen = new Set<string>();
const queue: CrashReportPayload[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function fingerprint(message: string, stack?: string): string {
  const first20 = (stack ?? '').split('\n').slice(0, 4).join('\n');
  return `${message}${FINGERPRINT_SEP}${first20}`;
}

function isDuplicate(message: string, stack?: string): boolean {
  const key = fingerprint(message, stack);
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}

/**
 * Strip dynamic path segments from URLs to avoid leaking conversation IDs,
 * user IDs, or other sensitive route params. Replaces UUID-like and ObjectId-
 * like segments with `:id`.
 */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(
      /\/[0-9a-f]{24}(?=\/|$)/gi,
      '/:id',
    ).replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi,
      '/:id',
    );
    return parsed.toString();
  } catch {
    return '';
  }
}

function buildPayload(
  message: string,
  stack?: string,
  componentStack?: string,
): CrashReportPayload {
  const includeUser = getCrashReportingIncludeUser();
  const rawUrl = typeof window !== 'undefined' ? window.location.href : '';

  return {
    message,
    stack,
    componentStack,
    url: includeUser ? rawUrl : sanitizeUrl(rawUrl),
    platform,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    appVersion,
    contactInfo: includeUser && userContext ? userContext : undefined,
    timestamp: new Date().toISOString(),
  };
}

function scheduleFlush(): void {
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flush();
  }, AUTO_SUBMIT_DEBOUNCE_MS);
}

async function flush(): Promise<void> {
  if (endpoint === undefined || endpoint === null || queue.length === 0) return;
  if (!getCrashReportingEnabled()) {
    queue.length = 0;
    return;
  }

  const batch = queue.splice(0, queue.length);
  for (const payload of batch) {
    try {
      await fetch(`${endpoint}/api/client-errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch {
      // Network failure — silently drop. We can't report that we can't report.
    }
  }
}

function onWindowError(event: ErrorEvent): void {
  const message = event.error?.message ?? event.message ?? 'Unknown error';
  const stack = event.error?.stack;
  capture(message, stack);
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : 'Unhandled promise rejection';
  const stack = reason instanceof Error ? reason.stack : undefined;
  capture(message, stack);
}

function capture(
  message: string,
  stack?: string,
  componentStack?: string,
): void {
  if (seen.size >= MAX_ERRORS_PER_SESSION) return;
  if (isDuplicate(message, stack)) return;

  const payload = buildPayload(message, stack, componentStack);
  queue.push(payload);
  scheduleFlush();
}

/**
 * Submit a crash report on demand (e.g. from the CrashBoundary UI) with an
 * optional user description attached. Manual submissions always send
 * regardless of the auto-report preference — the user is explicitly choosing
 * to report.
 */
async function submitReport(
  message: string,
  stack?: string,
  componentStack?: string,
  userDescription?: string,
): Promise<boolean> {
  if (endpoint === undefined || endpoint === null) return false;

  const payload = buildPayload(message, stack, componentStack);
  payload.userDescription = userDescription;

  try {
    const res = await fetch(`${endpoint}/api/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Update the user context attached to crash reports when `includeUser` is on.
 * Called from auth/identity providers on login/logout transitions.
 */
function setUserContext(ctx: CrashReportContactInfo | null): void {
  userContext = ctx;
}

export interface CrashReporterInitOptions {
  endpoint: string;
  platform?: CrashReportPayload['platform'];
  appVersion?: string;
}

function init(options: CrashReporterInitOptions): void {
  if (initialized) return;
  initialized = true;

  endpoint = options.endpoint;
  platform = options.platform ?? 'web';
  appVersion = options.appVersion;

  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
}

function destroy(): void {
  if (!initialized) return;
  initialized = false;
  window.removeEventListener('error', onWindowError);
  window.removeEventListener('unhandledrejection', onUnhandledRejection);
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

export const crashReporter = {
  init,
  destroy,
  capture,
  submitReport,
  setUserContext,
} as const;

/**
 * Client error report model.
 *
 * Stores crash reports submitted by the frontend when an unhandled error
 * causes the app to display the CrashBoundary fallback screen. Reports are
 * unauthenticated (the user may not be logged in) and auto-expire via a
 * TTL index on `createdAt`.
 */

import type { BaseDocument } from './base';

export interface ClientErrorContactInfo {
  type: 'account' | 'alias';
  identifier: string;
}

export interface ClientErrorDocument extends BaseDocument {
  /** The error message string. */
  message: string;

  /** JavaScript stack trace, if available. */
  stack?: string;

  /** React component stack from componentDidCatch, if available. */
  componentStack?: string;

  /** The page URL where the crash occurred. */
  url: string;

  /** Client platform: web, desktop, or mobile. */
  platform: 'web' | 'desktop' | 'mobile';

  /** User-Agent header value. */
  userAgent: string;

  /** Application build version, if available. */
  appVersion?: string;

  /** Optional freeform description from the user. */
  userDescription?: string;

  /** Optional contact info the user opted in to sharing. */
  contactInfo?: ClientErrorContactInfo;

  /** Client-reported ISO timestamp of the crash. */
  clientTimestamp: string;

  /** IP address of the submitter (for rate-limiting, not displayed). */
  ip: string;
}

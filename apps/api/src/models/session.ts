/**
 * Session model
 * Represents an authenticated user session stored in MongoDB
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * Session document stored in MongoDB (source of truth)
 */
export interface SessionDocument extends BaseDocument {
  /** Unique session identifier (used in cookie) */
  sessionId: string;

  /** Reference to the user document */
  userId: ObjectId;

  /** User identifier (email or phone) for display purposes */
  identifier: string;

  /** Identifier type */
  identifierType: 'email' | 'phone';

  /** Session expiration timestamp */
  expiresAt: Date;

  /** Last activity timestamp */
  lastActivityAt: Date;

  /** User agent string for security logging */
  userAgent?: string;

  /** IP address for security logging */
  ipAddress?: string;

  /** Whether the session has been explicitly revoked */
  revoked: boolean;
}

/**
 * Session creation input (without system-generated fields)
 */
export interface CreateSessionInput {
  sessionId: string;
  userId: ObjectId;
  identifier: string;
  identifierType: 'email' | 'phone';
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Session data for Redis cache (lightweight version)
 */
export interface CachedSessionData {
  /** User ID as hex string */
  userId: string;
  /** User identifier (email or phone) */
  identifier: string;
  /** Identifier type */
  identifierType: 'email' | 'phone';
  /** Session expiration timestamp (ms) */
  expiresAt: number;
  /** Last activity timestamp (ms) */
  lastActivityAt: number;
}

/**
 * Public session representation (safe to send to client)
 */
export interface PublicSession {
  /** Session ID (for revocation) */
  id: string;
  /** User identifier (email or phone) */
  identifier: string;
  /** Identifier type */
  identifierType: 'email' | 'phone';
  /** When the session was created */
  createdAt: string;
  /** Last activity timestamp */
  lastActivityAt: string;
  /** User agent (browser/device info) */
  userAgent?: string;
  /** IP address (partially masked for privacy) */
  ipAddress?: string;
  /** Whether this is the current session */
  isCurrent?: boolean;
}

/**
 * Mask IP address for privacy (show first two octets only)
 * e.g., "192.168.1.100" -> "192.168.*.*"
 */
function maskIpAddress(ip?: string): string | undefined {
  if (!ip) return undefined;
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  // IPv6 or other format - just show first part
  return ip.split(':').slice(0, 2).join(':') + ':*';
}

/**
 * Convert a SessionDocument to PublicSession (safe for client)
 */
export function toPublicSession(
  doc: SessionDocument,
  currentSessionId?: string
): PublicSession {
  return {
    id: doc.sessionId,
    identifier: doc.identifier,
    identifierType: doc.identifierType,
    createdAt: doc.createdAt.toISOString(),
    lastActivityAt: doc.lastActivityAt.toISOString(),
    userAgent: doc.userAgent,
    ipAddress: maskIpAddress(doc.ipAddress),
    isCurrent: currentSessionId ? doc.sessionId === currentSessionId : undefined,
  };
}

/**
 * Convert a SessionDocument to CachedSessionData (for Redis)
 */
export function toCachedSession(doc: SessionDocument): CachedSessionData {
  return {
    userId: doc.userId.toHexString(),
    identifier: doc.identifier,
    identifierType: doc.identifierType,
    expiresAt: doc.expiresAt.getTime(),
    lastActivityAt: doc.lastActivityAt.getTime(),
  };
}

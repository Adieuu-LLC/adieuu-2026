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
  identifier: string;
  identifierType: 'email' | 'phone';
  createdAt: string;
  lastActivityAt: string;
}

/**
 * Convert a SessionDocument to PublicSession (safe for client)
 */
export function toPublicSession(doc: SessionDocument): PublicSession {
  return {
    identifier: doc.identifier,
    identifierType: doc.identifierType,
    createdAt: doc.createdAt.toISOString(),
    lastActivityAt: doc.lastActivityAt.toISOString(),
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

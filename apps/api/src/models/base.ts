/**
 * Base model types
 * Common interfaces for all database models
 */

import type { ObjectId } from 'mongodb';

/**
 * Base document interface with common fields
 */
export interface BaseDocument {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Timestamps mixin for creating new documents
 */
export function withTimestamps<T>(data: T): T & { createdAt: Date; updatedAt: Date } {
  const now = new Date();
  return {
    ...data,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update timestamp mixin
 */
export function withUpdatedAt<T>(data: T): T & { updatedAt: Date } {
  return {
    ...data,
    updatedAt: new Date(),
  };
}

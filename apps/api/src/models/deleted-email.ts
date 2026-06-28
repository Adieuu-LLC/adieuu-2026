/**
 * Deleted email model.
 *
 * Stores SHA-256 hashes of emails belonging to deleted accounts.
 * Used to prevent re-signup with the same email address.
 */

import type { BaseDocument } from './base';

export interface DeletedEmailDocument extends BaseDocument {
  /** SHA-256 hash of the lowercased email address */
  emailHash: string;
  /** When the account was deleted */
  deletedAt: Date;
}

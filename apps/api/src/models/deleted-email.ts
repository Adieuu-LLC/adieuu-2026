/**
 * Deleted email model.
 *
 * Stores HMAC-SHA256 digests of emails belonging to deleted accounts.
 * Used to prevent re-signup with the same email address.
 */

import type { BaseDocument } from './base';

export interface DeletedEmailDocument extends BaseDocument {
  /** HMAC-SHA256 digest of the lowercased email address (keyed with accountHashSecret) */
  emailHash: string;
  /** When the account was deleted */
  deletedAt: Date;
}

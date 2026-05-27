/**
 * Audit log model
 * Tracks security-relevant events
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * Audit action types
 */
export type AuditAction =
  | 'otp_requested'
  | 'otp_verified'
  | 'otp_failed'
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'session_created'
  | 'session_revoked'
  | 'account_locked'
  | 'account_unlocked'
  | 'identifier_linked'
  | 'identifier_unlinked'
  | 'admin_gift_subscription'
  | 'admin_add_subscription_override'
  | 'admin_update_subscription_override'
  | 'admin_remove_subscription_override'
  | 'admin_approve_age'
  | 'admin_add_entitlement'
  | 'admin_remove_entitlement'
  | 'admin_suspend_account'
  | 'admin_unsuspend_account'
  | 'admin_ban_account'
  | 'admin_unban_account'
  | 'admin_suspend_identity'
  | 'admin_unsuspend_identity'
  | 'admin_ban_identity'
  | 'admin_unban_identity'
  | 'admin_add_identity_entitlement'
  | 'admin_remove_identity_entitlement'
  | 'admin_grant_platform_role'
  | 'admin_revoke_platform_role'
  | 'admin_grant_platform_attribute'
  | 'admin_revoke_platform_attribute';

/**
 * Audit log document stored in MongoDB
 */
export interface AuditLogDocument extends BaseDocument {
  // User reference (null for failed attempts on non-existent accounts)
  userId?: ObjectId;

  // Event details
  action: AuditAction;

  // Identifier used (hashed for privacy)
  identifierHash?: string;

  // Request metadata (hashed for privacy)
  ipHash: string;
  userAgent?: string;

  // Additional context
  metadata?: Record<string, unknown>;

  // Note: createdAt from BaseDocument serves as event timestamp
  // updatedAt is not meaningful for audit logs
}

/**
 * Audit log creation input
 */
export interface CreateAuditLogInput {
  userId?: ObjectId;
  action: AuditAction;
  identifierHash?: string;
  ipHash: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

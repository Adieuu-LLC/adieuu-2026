/**
 * Conversation service — DM and group conversations, messaging, invites.
 *
 * PRIVACY NOTES:
 * - All operations are identity-scoped (never linked to User)
 * - Message content is E2E encrypted; server handles only ciphertext
 * - Friendship and block checks enforced before conversation/member operations
 *
 * @module services/conversation
 */

export * from './types';
export * from './crud';
export * from './messaging';
export * from './group';
export * from './invites';

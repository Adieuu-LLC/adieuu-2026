/**
 * Server-side Space constants: reserved slugs and default role seeding.
 *
 * @module constants/spaces
 */

import { SPACE_PERMISSIONS, type SpacePermission } from '@adieuu/shared';

/**
 * Slugs that cannot be claimed by a Space. Prevents collisions with existing
 * or future top-level app routes and confusing/impersonating names. Compared
 * case-insensitively against the already-lowercased slug.
 */
export const SPACE_RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // App/route collisions
  's', 'space', 'spaces', 'api', 'app', 'www', 'admin', 'administrator',
  'settings', 'account', 'accounts', 'auth', 'login', 'logout', 'signup',
  'register', 'new', 'create', 'edit', 'delete', 'discover', 'explore',
  'directory', 'search', 'home', 'dashboard', 'help', 'support', 'about',
  'terms', 'privacy', 'legal', 'contact', 'billing', 'subscribe', 'upgrade',
  'pricing', 'invite', 'invites', 'join', 'me', 'you', 'user', 'users',
  'identity', 'identities', 'profile', 'profiles', 'notifications', 'messages',
  'conversations', 'friends', 'blocks', 'report', 'reports', 'moderation',
  'feedback', 'themes', 'emojis', 'uploads', 'media', 'cdn', 'assets',
  'static', 'public', 'private', 'null', 'undefined', 'true', 'false',
  // Brand / impersonation guards
  'adieuu', 'official', 'staff', 'system', 'root', 'mod', 'mods',
]);

/**
 * Whether a (lowercased) slug is reserved and cannot be used for a Space.
 */
export function isReservedSpaceSlug(slug: string): boolean {
  return SPACE_RESERVED_SLUGS.has(slug.toLowerCase());
}

/** Name of the seeded system Admin role (all permissions). */
export const DEFAULT_ADMIN_ROLE_NAME = 'Admin';
/** Name of the seeded default Member role (read + post). */
export const DEFAULT_MEMBER_ROLE_NAME = 'Member';

/** Admin role gets every permission. */
export const DEFAULT_ADMIN_PERMISSIONS: readonly SpacePermission[] = [...SPACE_PERMISSIONS];
/** Default member role can read and post only. */
export const DEFAULT_MEMBER_PERMISSIONS: readonly SpacePermission[] = ['read', 'post'];

/** Name of the single text channel auto-created with every new Space. */
export { DEFAULT_SPACE_CHANNEL_NAME } from '@adieuu/shared';

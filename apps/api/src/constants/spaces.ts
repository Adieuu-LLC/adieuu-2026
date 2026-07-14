/**
 * Server-side Space constants: reserved slugs and default role seeding.
 *
 * @module constants/spaces
 */

import { SPACE_PERMISSIONS, type SpacePermission } from '@adieuu/shared';

/**
 * Reserved slugs and their guard live in `@adieuu/shared` so the create flow
 * (client) and the API validate against a single source of truth.
 */
export { SPACE_RESERVED_SLUGS, isReservedSpaceSlug } from '@adieuu/shared';

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

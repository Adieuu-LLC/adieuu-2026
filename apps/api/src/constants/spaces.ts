/**
 * Server-side Space constants: reserved slugs and default role seeding.
 *
 * @module constants/spaces
 */

import { SPACE_PERMISSIONS, type SpacePermission } from '@adieuu/shared';

/**
 * Reserved slugs, system role names, and default channel name live in
 * `@adieuu/shared` so the create flow (client) and the API validate against
 * a single source of truth.
 */
export {
  SPACE_RESERVED_SLUGS,
  isReservedSpaceSlug,
  DEFAULT_ADMIN_ROLE_NAME,
  DEFAULT_MEMBER_ROLE_NAME,
  DEFAULT_SPACE_CHANNEL_NAME,
} from '@adieuu/shared';

/** Admin role gets every permission. */
export const DEFAULT_ADMIN_PERMISSIONS: readonly SpacePermission[] = [...SPACE_PERMISSIONS];
/** Default member role can read and post only. */
export const DEFAULT_MEMBER_PERMISSIONS: readonly SpacePermission[] = ['read', 'post'];

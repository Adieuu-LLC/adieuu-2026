/**
 * Server-side Space constants: reserved slugs and default role seeding.
 *
 * @module constants/spaces
 */

/**
 * Reserved slugs, system role names, default category/channel names, and
 * default permission sets live in `@adieuu/shared` so the create flow
 * (client) and the API validate against a single source of truth.
 */
export {
  SPACE_RESERVED_SLUGS,
  isReservedSpaceSlug,
  DEFAULT_ADMIN_ROLE_NAME,
  DEFAULT_MEMBER_ROLE_NAME,
  DEFAULT_SPACE_CHANNEL_NAME,
  DEFAULT_SPACE_CATEGORY_NAME,
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_MEMBER_PERMISSIONS,
  DEFAULT_ADMIN_ROLE_COLOR,
  DEFAULT_MEMBER_ROLE_COLOR,
  DEFAULT_CUSTOM_ROLE_COLOR,
} from '@adieuu/shared';

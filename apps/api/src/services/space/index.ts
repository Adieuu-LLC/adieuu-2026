/**
 * Space service layer.
 *
 * @module services/space
 */

export * from './types';
export {
  createSpace,
  getSpaceBySlug,
  listMySpaces,
  discoverSpaces,
  isSlugAvailable,
} from './crud';

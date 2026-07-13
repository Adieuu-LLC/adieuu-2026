import type { ProfilePrivacySettings, BadgeId } from './identity-types';

/**
 * Parameters for updating an identity profile.
 */
export interface UpdateProfileParams {
  displayName?: string;
  bio?: string;
  avatarMediaId?: string;
  bannerMediaId?: string;
  removeAvatar?: boolean;
  removeBanner?: boolean;
  profileColors?: {
    accent?: string | null;
    cardBackground?: string | null;
    background?: string | null;
  };
  privacySettings?: Partial<ProfilePrivacySettings>;
  requireGroupApproval?: boolean;
  /** Ordered badge selection (up to 3). Each must be an earned badge; duplicates are rejected. */
  selectedBadges?: BadgeId[];
}

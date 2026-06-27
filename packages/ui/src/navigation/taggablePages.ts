import { useMemo } from 'react';
import type { AppIconName } from '../icons/appIcons';
import type { SessionInfo } from '@adieuu/shared';
import { useAuth, type AuthStatus } from '../hooks/useAuth';
import { useIdentity } from '../hooks/useIdentity';
import type { IdentityStatus } from '../hooks/useIdentity.types';

export type PageAccessLevel = 'public' | 'authenticated' | 'identity' | 'admin' | 'moderator';

export interface TaggablePage {
  id: string;
  path: string;
  labelKey: string;
  labelDefault: string;
  icon?: AppIconName;
  access: PageAccessLevel;
  aliases?: string[];
}

export const TAGGABLE_PAGES: readonly TaggablePage[] = [
  // Public
  { id: 'home', path: '/', labelKey: 'home.title', labelDefault: 'Home', icon: 'home', access: 'public' },
  { id: 'about', path: '/about', labelKey: 'about.title', labelDefault: 'About', icon: 'info', access: 'public' },
  { id: 'learn', path: '/about/learn', labelKey: 'home.learn.navLabel', labelDefault: 'Learn', icon: 'info', access: 'public' },
  { id: 'roadmap', path: '/about/roadmap', labelKey: 'about.roadmap.title', labelDefault: 'Roadmap', icon: 'clock', access: 'public', aliases: ['map', 'planned', 'upcoming'] },
  { id: 'feedback', path: '/feedback', labelKey: 'feedback.title', labelDefault: 'Feedback', icon: 'info', access: 'public', aliases: ['vote', 'features', 'suggest'] },
  { id: 'download', path: '/download', labelKey: 'nav.getDesktopApp', labelDefault: 'Download', icon: 'download', access: 'public', aliases: ['desktop', 'app'] },
  { id: 'search', path: '/search', labelKey: 'search.title', labelDefault: 'Search', icon: 'search', access: 'public' },
  { id: 'spaces', path: '/spaces', labelKey: 'spaces.title', labelDefault: 'Spaces', icon: 'spaces', access: 'public' },
  { id: 'legal', path: '/legal-policies', labelKey: 'legal.directoryTitle', labelDefault: 'Legal Policies', icon: 'info', access: 'public', aliases: ['legal-policies', 'tos', 'privacy-policy'] },

  // Authenticated
  { id: 'conversations', path: '/conversations/new', labelKey: 'conversations.new', labelDefault: 'Conversations', icon: 'message', access: 'authenticated', aliases: ['messages', 'chat', 'dms'] },
  { id: 'support', path: '/support', labelKey: 'support.title', labelDefault: 'Support', icon: 'mask', access: 'authenticated', aliases: ['help', 'tickets'] },

  // Account (authenticated session)
  { id: 'account', path: '/account/overview', labelKey: 'account.overview.title', labelDefault: 'Account', icon: 'user', access: 'authenticated', aliases: ['account-overview'] },
  { id: 'security', path: '/account/security', labelKey: 'account.security.title', labelDefault: 'Security', icon: 'user', access: 'authenticated', aliases: ['password', 'mfa', 'sessions'] },
  { id: 'account-subscription', path: '/account/subscription', labelKey: 'account.subscription.title', labelDefault: 'Subscription', icon: 'user', access: 'authenticated', aliases: ['billing', 'plan'] },
  { id: 'referrals', path: '/account/referrals', labelKey: 'account.referral.title', labelDefault: 'Referrals', icon: 'user', access: 'authenticated', aliases: ['invite', 'refer'] },

  // Identity (alias session)
  { id: 'profile', path: '/identity/profile', labelKey: 'identity.profile.title', labelDefault: 'Profile', icon: 'mask', access: 'identity', aliases: ['alias'] },
  { id: 'appearance', path: '/identity/appearance', labelKey: 'identity.appearance.title', labelDefault: 'Appearance', icon: 'palette', access: 'identity', aliases: ['theme', 'themes'] },
  { id: 'notifications', path: '/identity/notifications', labelKey: 'account.settings.title', labelDefault: 'Notifications', icon: 'bell', access: 'identity', aliases: ['notification-settings'] },
  { id: 'privacy', path: '/identity/privacy', labelKey: 'identity.privacy.title', labelDefault: 'Privacy', icon: 'lock', access: 'identity', aliases: ['privacy-settings', 'blocked'] },
  { id: 'devices', path: '/identity/devices', labelKey: 'identity.devices.title', labelDefault: 'Devices', icon: 'device', access: 'identity' },
  { id: 'ciphers', path: '/identity/ciphers', labelKey: 'ciphers.title', labelDefault: 'Ciphers', icon: 'key', access: 'identity', aliases: ['encryption', 'keys'] },
  { id: 'emojis', path: '/identity/emojis', labelKey: 'identity.customEmojis.title', labelDefault: 'Custom Emojis', icon: 'smile', access: 'identity', aliases: ['custom-emojis', 'emoji'] },
  { id: 'identity-subscription', path: '/identity/subscription', labelKey: 'account.subscription.title', labelDefault: 'Subscription', icon: 'user', access: 'identity', aliases: ['billing', 'plan'] },

  // Admin
  { id: 'admin', path: '/admin/dashboard', labelKey: 'admin.dashboard.title', labelDefault: 'Admin Dashboard', icon: 'shield', access: 'admin', aliases: ['admin-dashboard', 'administration'] },

  // Moderator
  { id: 'moderation', path: '/moderation', labelKey: 'moderation.nav.submenuLabel', labelDefault: 'Moderation', icon: 'shield', access: 'moderator', aliases: ['mod', 'reports'] },
];

const PAGE_MAP = new Map(TAGGABLE_PAGES.map((p) => [p.id, p]));

export function getTaggablePage(id: string): TaggablePage | undefined {
  return PAGE_MAP.get(id);
}

export function canAccessPage(
  page: TaggablePage,
  authStatus: AuthStatus,
  identityStatus: IdentityStatus,
  session: SessionInfo | null,
): boolean {
  switch (page.access) {
    case 'public':
      return true;
    case 'authenticated':
      return authStatus === 'authenticated' || authStatus === 'identity_mode';
    case 'identity':
      return identityStatus === 'logged_in';
    case 'admin':
      return session?.isPlatformAdmin === true;
    case 'moderator':
      return (
        session?.isPlatformModerator === true ||
        session?.isPlatformAdmin === true ||
        session?.isPlatformSupportAgent === true
      );
    default:
      return false;
  }
}

export function useTaggablePages(): {
  accessiblePages: TaggablePage[];
  canAccess: (pageId: string) => boolean;
} {
  const { status: authStatus, session } = useAuth();
  const { status: identityStatus } = useIdentity();

  return useMemo(() => {
    const accessiblePages = TAGGABLE_PAGES.filter((p) =>
      canAccessPage(p, authStatus, identityStatus, session),
    );
    const accessibleIds = new Set(accessiblePages.map((p) => p.id));
    return {
      accessiblePages,
      canAccess: (pageId: string) => accessibleIds.has(pageId),
    };
  }, [authStatus, identityStatus, session]);
}

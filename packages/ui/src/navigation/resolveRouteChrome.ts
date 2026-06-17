import type { AppIconName } from '../icons/appIcons';

export type RouteChromeDescriptor = {
  icon?: AppIconName;
  titleKey: string;
  titleDefault: string;
  /** When set, `useRouteChrome` resolves the title dynamically instead of via i18n. */
  dynamic?: 'conversation' | 'identity-profile';
};

const IDENTITY_SETTINGS_SEGMENTS = new Set([
  'profile',
  'appearance',
  'notifications',
  'privacy',
  'devices',
  'ciphers',
  'emojis',
  'subscription',
]);

function isPublicIdentityProfile(pathname: string): boolean {
  const match = pathname.match(/^\/identity\/([^/]+)$/);
  if (!match) return false;
  return !IDENTITY_SETTINGS_SEGMENTS.has(match[1]!);
}

/**
 * Maps the current pathname to a sidebar-style icon and i18n title key.
 * Most specific routes should be matched before broader prefixes.
 */
export function resolveRouteChrome(pathname: string): RouteChromeDescriptor {
  if (pathname === '/') {
    return { icon: 'home', titleKey: 'home.title', titleDefault: 'Welcome to Adieuu' };
  }

  if (pathname.startsWith('/auth/login')) {
    return { icon: 'user', titleKey: 'auth.login.title', titleDefault: 'Sign in to Adieuu' };
  }
  if (pathname.startsWith('/auth/verify')) {
    return { icon: 'user', titleKey: 'auth.verify.title', titleDefault: 'Enter verification code' };
  }
  if (pathname.startsWith('/auth/mfa')) {
    return { icon: 'lock', titleKey: 'auth.mfa.title', titleDefault: 'Two-factor authentication' };
  }

  if (pathname === '/conversations/new') {
    return { icon: 'message', titleKey: 'conversations.new', titleDefault: 'New Conversation' };
  }
  if (pathname.startsWith('/conversations/')) {
    return {
      icon: 'message',
      titleKey: 'conversations.title',
      titleDefault: 'Conversation',
      dynamic: 'conversation',
    };
  }

  if (pathname === '/search') {
    return { icon: 'search', titleKey: 'search.title', titleDefault: 'Search' };
  }
  if (pathname === '/spaces') {
    return { icon: 'spaces', titleKey: 'spaces.title', titleDefault: 'Spaces' };
  }
  if (pathname === '/download') {
    return { icon: 'download', titleKey: 'download.title', titleDefault: 'Download the desktop app' };
  }

  if (pathname === '/about/roadmap') {
    return { icon: 'info', titleKey: 'about.roadmap.title', titleDefault: 'Roadmap' };
  }
  if (pathname === '/about/learn') {
    return { icon: 'info', titleKey: 'home.learn.navLabel', titleDefault: 'Learn' };
  }
  if (pathname === '/about/updates') {
    return { icon: 'info', titleKey: 'about.updates.title', titleDefault: 'Check for Updates' };
  }
  if (pathname === '/about') {
    return { icon: 'info', titleKey: 'about.title', titleDefault: 'About Adieuu' };
  }

  if (pathname === '/feedback/new') {
    return { icon: 'info', titleKey: 'feedback.newPost', titleDefault: 'Submit feedback' };
  }
  if (pathname.startsWith('/feedback/')) {
    return { icon: 'info', titleKey: 'feedback.title', titleDefault: 'Vote on Features!' };
  }
  if (pathname === '/feedback') {
    return { icon: 'info', titleKey: 'feedback.title', titleDefault: 'Vote on Features!' };
  }

  if (pathname.startsWith('/legal-policies/')) {
    return { icon: 'info', titleKey: 'legal.directoryTitle', titleDefault: 'Legal Policies' };
  }
  if (pathname === '/legal-policies') {
    return { icon: 'info', titleKey: 'legal.directoryTitle', titleDefault: 'Legal Policies' };
  }

  if (isPublicIdentityProfile(pathname)) {
    return {
      icon: 'mask',
      titleKey: 'identity.profile.title',
      titleDefault: 'Profile',
      dynamic: 'identity-profile',
    };
  }

  if (pathname.startsWith('/identity/appearance/community')) {
    return { icon: 'palette', titleKey: 'identity.appearance.title', titleDefault: 'Alias Appearance' };
  }
  if (pathname.startsWith('/identity/appearance')) {
    return { icon: 'palette', titleKey: 'identity.appearance.title', titleDefault: 'Alias Appearance' };
  }
  if (pathname.startsWith('/identity/notifications')) {
    return { icon: 'bell', titleKey: 'account.settings.title', titleDefault: 'Notification Settings' };
  }
  if (pathname.startsWith('/identity/privacy')) {
    return { icon: 'lock', titleKey: 'identity.privacy.title', titleDefault: 'Privacy & Security' };
  }
  if (pathname.startsWith('/identity/devices')) {
    return { icon: 'device', titleKey: 'identity.devices.title', titleDefault: 'Devices' };
  }
  if (pathname.startsWith('/identity/ciphers')) {
    return { icon: 'key', titleKey: 'ciphers.title', titleDefault: 'Ciphers' };
  }
  if (pathname.startsWith('/identity/emojis')) {
    return { icon: 'smile', titleKey: 'identity.customEmojis.title', titleDefault: 'Custom Emojis' };
  }
  if (pathname.startsWith('/identity/subscription')) {
    return { icon: 'user', titleKey: 'account.subscription.title', titleDefault: 'Subscription' };
  }
  if (pathname.startsWith('/identity/profile')) {
    return { icon: 'mask', titleKey: 'identity.profile.title', titleDefault: 'Profile' };
  }
  if (pathname.startsWith('/identity')) {
    return { icon: 'mask', titleKey: 'identity.profile.title', titleDefault: 'Profile' };
  }

  if (pathname.startsWith('/account/security')) {
    return { icon: 'user', titleKey: 'account.security.title', titleDefault: 'Security' };
  }
  if (pathname.startsWith('/account/subscription')) {
    return { icon: 'user', titleKey: 'account.subscription.title', titleDefault: 'Subscription' };
  }
  if (pathname.startsWith('/account/referrals')) {
    return { icon: 'user', titleKey: 'account.referral.title', titleDefault: 'Referrals' };
  }
  if (pathname.startsWith('/account/appearance/community')) {
    return { icon: 'palette', titleKey: 'account.appearance.title', titleDefault: 'Appearance' };
  }
  if (pathname.startsWith('/account/overview')) {
    return { icon: 'user', titleKey: 'account.overview.title', titleDefault: 'Account Overview' };
  }
  if (pathname.startsWith('/account')) {
    return { icon: 'user', titleKey: 'account.overview.title', titleDefault: 'Account Overview' };
  }

  if (pathname === '/support/new') {
    return { icon: 'mask', titleKey: 'support.newTicket', titleDefault: 'New ticket' };
  }
  if (pathname.startsWith('/support/')) {
    return { icon: 'mask', titleKey: 'support.title', titleDefault: 'Support' };
  }
  if (pathname === '/support') {
    return { icon: 'mask', titleKey: 'support.myTickets', titleDefault: 'My tickets' };
  }

  if (pathname === '/sponsorship/request') {
    return { icon: 'handshake', titleKey: 'sponsorship.request.heading', titleDefault: 'Request sponsorship' };
  }
  if (pathname === '/sponsorship/directory') {
    return { icon: 'handshake', titleKey: 'sponsorship.directory.heading', titleDefault: 'Sponsorship directory' };
  }

  if (pathname === '/admin/dashboard') {
    return { icon: 'shield', titleKey: 'admin.dashboard.title', titleDefault: 'Admin dashboard' };
  }
  if (pathname === '/admin/platform-admins') {
    return { icon: 'shield', titleKey: 'admin.platformAdmins.title', titleDefault: 'Platform admins' };
  }
  if (pathname === '/admin/auth-allowlist') {
    return { icon: 'shield', titleKey: 'admin.authAllowlist.title', titleDefault: 'Auth allowlist' };
  }
  if (pathname === '/admin/age-verification') {
    return { icon: 'shield', titleKey: 'admin.nav.ageVerification', titleDefault: 'Age/Geofencing' };
  }
  if (pathname.startsWith('/admin/users/')) {
    return { icon: 'shield', titleKey: 'admin.users.title', titleDefault: 'User Management' };
  }
  if (pathname === '/admin/users') {
    return { icon: 'shield', titleKey: 'admin.users.title', titleDefault: 'User Management' };
  }
  if (pathname.startsWith('/admin/identities/')) {
    return { icon: 'shield', titleKey: 'admin.identities.title', titleDefault: 'Alias Management' };
  }
  if (pathname === '/admin/identities') {
    return { icon: 'shield', titleKey: 'admin.identities.title', titleDefault: 'Alias Management' };
  }
  if (pathname === '/admin/promo-codes') {
    return { icon: 'shield', titleKey: 'admin.promoCodes.title', titleDefault: 'Promotional codes' };
  }
  if (pathname.startsWith('/admin')) {
    return { icon: 'shield', titleKey: 'admin.dashboard.title', titleDefault: 'Admin dashboard' };
  }

  if (pathname.startsWith('/moderation/reports/')) {
    return { icon: 'shield', titleKey: 'moderation.reports.title', titleDefault: 'Platform Reports' };
  }
  if (pathname === '/moderation/reports') {
    return { icon: 'shield', titleKey: 'moderation.reports.title', titleDefault: 'Platform Reports' };
  }
  if (pathname.startsWith('/moderation/tickets/')) {
    return { icon: 'shield', titleKey: 'moderation.tickets.title', titleDefault: 'Support Tickets' };
  }
  if (pathname === '/moderation/tickets') {
    return { icon: 'shield', titleKey: 'moderation.tickets.title', titleDefault: 'Support Tickets' };
  }
  if (pathname.startsWith('/moderation')) {
    return { icon: 'shield', titleKey: 'moderation.nav.submenuLabel', titleDefault: 'Moderation' };
  }

  if (pathname.startsWith('/refer/')) {
    return { icon: 'user', titleKey: 'account.referral.landing.title', titleDefault: 'Referral' };
  }
  if (pathname === '/service-status') {
    return { icon: 'info', titleKey: 'serviceStatus.title', titleDefault: 'Service Status' };
  }
  if (pathname === '/checkout/complete') {
    return { icon: 'user', titleKey: 'account.checkout.complete.titleSuccess', titleDefault: 'Purchase complete' };
  }

  const segment = pathname.split('/').filter(Boolean).pop();
  return {
    titleKey: 'nav.pageFallback',
    titleDefault: segment ? segment.replace(/-/g, ' ') : 'Adieuu',
  };
}

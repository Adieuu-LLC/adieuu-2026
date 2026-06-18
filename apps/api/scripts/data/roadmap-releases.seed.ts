/**
 * Official roadmap release entries for the public timeline (status: released).
 *
 * Run `bun run apps/api/scripts/seed-roadmap-releases.ts` to upsert into MongoDB.
 *
 * Each row maps to one feedback post card on /about/roadmap (past section).
 * Grouped by `releasedAt` (YYYY-MM-DD). Re-running the seed script is idempotent.
 */

import type { FeedbackCategory } from '@adieuu/shared';

export type RoadmapReleaseTier = 'major' | 'minor';

export interface RoadmapReleaseSeedRow {
  /** Stable post id — do not change once deployed (upsert key). */
  postId: string;
  title: string;
  description: string;
  category: FeedbackCategory;
  /** UTC date key for timeline grouping (YYYY-MM-DD). */
  releasedAt: string;
  tier: RoadmapReleaseTier;
}

export const ROADMAP_RELEASE_SEED: RoadmapReleaseSeedRow[] = [
  // ── 2026-01-01 · Core platform ──────────────────────────────────────────────
  {
    postId: 'FB-RM-001',
    title: 'Passwordless sign-in',
    description:
      'Sign in or create an account with a one-time code sent to your email or phone — no traditional password required.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-002',
    title: 'Multi-factor authentication',
    description:
      'Protect your account with TOTP authenticator apps as a second factor at sign-in.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-003',
    title: 'Passkeys & WebAuthn',
    description:
      'Register Face ID, Touch ID, Windows Hello, or a hardware security key for passwordless MFA.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-004',
    title: 'Anonymous Alias identity',
    description:
      'Use a separate public Alias for messaging and social activity, cryptographically isolated from your account login.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-005',
    title: 'Direct messages',
    description:
      'One-to-one end-to-end encrypted conversations with real-time delivery over WebSocket.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-006',
    title: 'Group conversations',
    description:
      'Multi-member encrypted group chats with admins, invites, and optional join approval.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-007',
    title: 'End-to-end message encryption',
    description:
      'All DMs and group messages are encrypted on your device before they reach our servers.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-008',
    title: 'Post-quantum hybrid cryptography',
    description:
      'Hybrid classical and ML-KEM protection for encryption keys, documented in the Learn center.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-009',
    title: 'Forward secrecy',
    description:
      'Optional per-message and conversation-level forward-secrecy modes for stronger ephemeral encryption.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-010',
    title: 'Friends & people search',
    description:
      'Add and manage friends, search by username or display name, and open profiles from results.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-011',
    title: 'Message reactions & pins',
    description:
      'React to messages with emoji and pin important messages for quick access later.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-012',
    title: '@Mentions & disappearing messages',
    description:
      'Mention participants in group chats and set messages to auto-delete after a timer.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-013',
    title: 'Encrypted media attachments',
    description:
      'Send images and videos with client-side encryption and automated safety scanning before delivery.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-014',
    title: 'Block & report',
    description:
      'Block aliases to stop unwanted contact and report messages or profiles for moderator review.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-015',
    title: 'Onboarding product tour',
    description:
      'Guided walkthrough of search, sidebar tabs, your Alias menu, account settings, and sign-out.',
    category: 'improvement',
    releasedAt: '2026-01-01',
    tier: 'minor',
  },
  {
    postId: 'FB-RM-016',
    title: 'Device signatures',
    description:
      'Compare device trust fingerprints in a conversation to verify end-to-end encryption identity.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'minor',
  },
  {
    postId: 'FB-RM-017',
    title: 'Key backup export & import',
    description:
      'Back up and restore device encryption keys with an encrypted .adieuu-keys file.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'minor',
  },
  {
    postId: 'FB-RM-018',
    title: 'Message edit history',
    description:
      'Edit sent text messages end-to-end and view prior versions in the edit history.',
    category: 'improvement',
    releasedAt: '2026-01-01',
    tier: 'minor',
  },
  {
    postId: 'FB-RM-019',
    title: 'Group admin tools',
    description:
      'Promote admins, remove members, rename topics, and transfer admin when leaving a group.',
    category: 'feature',
    releasedAt: '2026-01-01',
    tier: 'minor',
  },

  // ── 2026-03-15 · Themes, billing, desktop, compliance ───────────────────
  {
    postId: 'FB-RM-020',
    title: 'Preset themes & theme editor',
    description:
      'Apply official color presets or customize individual colors and save personal themes.',
    category: 'feature',
    releasedAt: '2026-03-15',
    tier: 'major',
  },
  {
    postId: 'FB-RM-021',
    title: 'Community theme marketplace',
    description:
      'Browse, search, upvote, download, and apply themes shared by other users.',
    category: 'feature',
    releasedAt: '2026-03-15',
    tier: 'major',
  },
  {
    postId: 'FB-RM-022',
    title: 'Subscription plans & Stripe billing',
    description:
      'Access and Insider annual plans plus lifetime Vanguard and Founder tiers, with Stripe checkout and billing portal.',
    category: 'feature',
    releasedAt: '2026-03-15',
    tier: 'major',
  },
  {
    postId: 'FB-RM-023',
    title: 'Sponsorship program',
    description:
      'Request community-funded access or sponsor another user\'s subscription from the directory.',
    category: 'feature',
    releasedAt: '2026-03-15',
    tier: 'major',
  },
  {
    postId: 'FB-RM-024',
    title: 'Age verification & geofencing',
    description:
      'Third-party age checks on your account and jurisdiction-based access rules where required by law.',
    category: 'feature',
    releasedAt: '2026-03-15',
    tier: 'major',
  },
  {
    postId: 'FB-RM-025',
    title: 'Support tickets',
    description:
      'Open tickets by category with markdown and attachments, then track replies from support staff.',
    category: 'feature',
    releasedAt: '2026-03-15',
    tier: 'major',
  },
  {
    postId: 'FB-RM-026',
    title: 'Desktop app & auto-update',
    description:
      'Native Electron builds for Windows, macOS, and Linux with automatic update checks and installs.',
    category: 'feature',
    releasedAt: '2026-03-15',
    tier: 'major',
  },
  {
    postId: 'FB-RM-027',
    title: 'Learn center',
    description:
      'Searchable in-app documentation covering privacy, security, aliases, subscriptions, and ID verification.',
    category: 'feature',
    releasedAt: '2026-03-15',
    tier: 'major',
  },
  {
    postId: 'FB-RM-028',
    title: 'VPN & regulatory attestation prompts',
    description:
      'Compliance attestation modals for VPN use, sanctioned regions, and other regulatory scenarios.',
    category: 'improvement',
    releasedAt: '2026-03-15',
    tier: 'minor',
  },
  {
    postId: 'FB-RM-029',
    title: 'Promo code redemption',
    description:
      'Redeem partner or promotional codes for access or entitlements at checkout.',
    category: 'feature',
    releasedAt: '2026-03-15',
    tier: 'minor',
  },
  {
    postId: 'FB-RM-030',
    title: 'Privacy & presence controls',
    description:
      'Toggle read receipts, typing indicators, and last-seen visibility per your preferences.',
    category: 'improvement',
    releasedAt: '2026-03-15',
    tier: 'minor',
  },
  {
    postId: 'FB-RM-031',
    title: 'Native notifications & custom sounds',
    description:
      'OS-level alerts when unfocused, with separate sounds for messages, mentions, TTL, calls, and achievements.',
    category: 'improvement',
    releasedAt: '2026-03-15',
    tier: 'minor',
  },
  {
    postId: 'FB-RM-032',
    title: 'Service status page',
    description:
      'Live API and chat WebSocket health checks at /service-status.',
    category: 'improvement',
    releasedAt: '2026-03-15',
    tier: 'minor',
  },

  // ── 2026-05-31 · v0.2.0 milestone ───────────────────────────────────────────
  {
    postId: 'FB-RM-033',
    title: 'Adieuu 0.2',
    description:
      'Version 0.2 release — the first numbered milestone bundling the core messaging, identity, and billing platform.',
    category: 'improvement',
    releasedAt: '2026-05-31',
    tier: 'major',
  },

  // ── 2026-06-01 · Custom emoji, embeds, referrals ────────────────────────
  {
    postId: 'FB-RM-034',
    title: 'Custom emoji upload & reactions',
    description:
      'Upload PNG, WebP, or GIF emoji with shortcodes and use them in messages and reactions.',
    category: 'feature',
    releasedAt: '2026-06-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-035',
    title: 'GIFs & stickers (KLIPY)',
    description:
      'Search and send GIFs and stickers from KLIPY directly in the message composer.',
    category: 'feature',
    releasedAt: '2026-06-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-036',
    title: 'Link embeds & unfurl',
    description:
      'Automatic URL previews and supported video embeds in messages, with external link warnings.',
    category: 'feature',
    releasedAt: '2026-06-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-037',
    title: 'Referral program',
    description:
      'Create referral links and codes, share them at signup, and track invited users.',
    category: 'feature',
    releasedAt: '2026-06-01',
    tier: 'major',
  },
  {
    postId: 'FB-RM-038',
    title: 'Community Ciphers',
    description:
      'Create and manage shared encryption keys (entropy phrases) to prepare for future Spaces.',
    category: 'feature',
    releasedAt: '2026-06-01',
    tier: 'minor',
  },

  // ── 2026-06-10 · Feedback board & local search ───────────────────────────
  {
    postId: 'FB-RM-039',
    title: 'Public feedback board',
    description:
      'Browse, upvote, and comment on feature requests and bug reports from the community.',
    category: 'feature',
    releasedAt: '2026-06-10',
    tier: 'major',
  },
  {
    postId: 'FB-RM-040',
    title: 'Local message search',
    description:
      'Search decrypted message text on-device with filters and configurable retention controls.',
    category: 'feature',
    releasedAt: '2026-06-10',
    tier: 'major',
  },
  {
    postId: 'FB-RM-041',
    title: 'Feedback notifications',
    description:
      'Get notified when someone replies to your feedback posts or comments.',
    category: 'improvement',
    releasedAt: '2026-06-10',
    tier: 'minor',
  },

  // ── 2026-06-14 · Moderation & compliance polish ──────────────────────────
  {
    postId: 'FB-RM-042',
    title: 'Sanctioned country support',
    description:
      'Expanded compliance handling for OFAC and other sanctioned jurisdictions during sign-in and use.',
    category: 'improvement',
    releasedAt: '2026-06-14',
    tier: 'minor',
  },
  {
    postId: 'FB-RM-043',
    title: 'Platform moderation improvements',
    description:
      'Enhanced report triage, evidence review, and staff tooling for content moderation.',
    category: 'improvement',
    releasedAt: '2026-06-14',
    tier: 'minor',
  },

  // ── 2026-06-16 · Voice & video calls ────────────────────────────────────
  {
    postId: 'FB-RM-044',
    title: 'Voice & video calls',
    description:
      'Start, join, accept, or decline voice and video calls directly inside conversations.',
    category: 'feature',
    releasedAt: '2026-06-16',
    tier: 'major',
  },
  {
    postId: 'FB-RM-045',
    title: 'Screen sharing',
    description:
      'Share your screen during an active voice or video call.',
    category: 'feature',
    releasedAt: '2026-06-16',
    tier: 'major',
  },
  {
    postId: 'FB-RM-046',
    title: 'End-to-end encrypted calls',
    description:
      'Call audio and video protected with end-to-end encryption, with a visible status indicator in the call UI.',
    category: 'feature',
    releasedAt: '2026-06-16',
    tier: 'major',
  },
  {
    postId: 'FB-RM-047',
    title: 'Call UI improvements',
    description:
      'Resizable call frames, speaker highlight, participant pinning, connection quality, and in-call controls.',
    category: 'improvement',
    releasedAt: '2026-06-16',
    tier: 'minor',
  },

  // ── 2026-06-17 · Latest release ───────────────────────────────────────────
  {
    postId: 'FB-RM-048',
    title: 'Achievements expansion',
    description:
      'Expanded achievement badges for social, messaging, security, and easter-egg actions with unlock celebrations.',
    category: 'feature',
    releasedAt: '2026-06-17',
    tier: 'minor',
  },
  {
    postId: 'FB-RM-049',
    title: 'Public roadmap timeline',
    description:
      'Visual timeline on the Roadmap page showing shipped releases and planned work, with deep links to feedback posts.',
    category: 'feature',
    releasedAt: '2026-06-17',
    tier: 'major',
  },
];

import type {
  SubscriptionStatus,
  PurchasableProductId,
  SubscriptionCatalogPricesMap,
  BillingDetailsPayload,
} from '@adieuu/shared';

export interface SubscriptionDerivedState {
  hasAccess: boolean;
  hasInsider: boolean;
  isLifetime: boolean;
  hasVanguard: boolean;
  hasFounder: boolean;
  /** Admin-granted / internal: subscription was gifted (no Stripe customer expected). */
  hasGifted: boolean;
  hasPaidPlan: boolean;
}

export interface SubscriptionTabProps {
  status: SubscriptionStatus | null;
  derived: SubscriptionDerivedState;
  identityMode: boolean;
}

export interface PlansTabProps extends SubscriptionTabProps {
  actionLoading: boolean;
  statusLabel: string | null;
  onCheckout: (product: PurchasableProductId) => void;
  onManage: () => void;
  catalogPrices: SubscriptionCatalogPricesMap | null;
  catalogPricesLoading: boolean;
}

export interface LifetimeTabProps extends SubscriptionTabProps {
  actionLoading: boolean;
  onCheckout: (product: PurchasableProductId) => void;
  catalogPrices: SubscriptionCatalogPricesMap | null;
  catalogPricesLoading: boolean;
}

export interface BillingTabProps {
  status: SubscriptionStatus | null;
  derived: SubscriptionDerivedState;
  identityMode: boolean;
  actionLoading: boolean;
  onManage: () => void | Promise<void>;
  billingDetails: BillingDetailsPayload | null;
  billingDetailsLoading: boolean;
  billingDetailsError: boolean;
}

export interface ManageTabProps extends SubscriptionTabProps {
  actionLoading: boolean;
  statusLabel: string | null;
  onManage: () => void;
  pollPending: boolean;
  onCancelPoll: () => void;
  onCheckout: (product: PurchasableProductId) => void;
  /** Stripe list prices for the comparison table billing row; null when unavailable. */
  catalogPrices: SubscriptionCatalogPricesMap | null;
  catalogPricesLoading: boolean;
  promoLoading: boolean;
  onRedeemPromo: (shortcode: string) => Promise<{ ok: true } | { ok: false; errorCode?: string }>;
}

/** Column order in the comparison table (and keys used in `featureVariables`). */
export const COMPARISON_COLUMN_IDS = ['access', 'insider', 'vanguard', 'founder'] as const;
export type ComparisonColumnId = (typeof COMPARISON_COLUMN_IDS)[number];

export const ACCESS_FEATURES = [
  'aliases',
  'encryption',
  'forwardSecrecy',
  'liveMedia',
  'streamQuality',
  'uploadSize',
  'emojiLimit',
  'ttlMessages',
  'themes',
  'federation',
  'mfa',
  'supportDev',
  'privateSpace',
  'moderationOptOut',
  'featureEa',
  'featureVote',
  'badgeInsider',
] as const;

/** Insider annual adds these on top of Access. */
export const INSIDER_ONLY_FEATURES = ['callMonthly'] as const;

export const INSIDER_FEATURES = [...ACCESS_FEATURES, ...INSIDER_ONLY_FEATURES] as const;

export const VANGUARD_ONLY_FEATURES = ['badgeVanguard', 'designAchievement'] as const;

export const FOUNDER_ONLY_FEATURES = ['badgeFounder', 'whaleWall', 'callBiWeekly'] as const;

export const VANGUARD_FEATURES = [...INSIDER_FEATURES, ...VANGUARD_ONLY_FEATURES] as const;

export const FOUNDER_FEATURES = [...VANGUARD_FEATURES, ...FOUNDER_ONLY_FEATURES] as const;

/** Single ordered list of feature rows in the comparison matrix and lifetime bullets. */
export const COMPARISON_FEATURE_ORDER = [
  ...ACCESS_FEATURES,
  ...INSIDER_ONLY_FEATURES,
  ...VANGUARD_ONLY_FEATURES,
  ...FOUNDER_ONLY_FEATURES,
] as const satisfies readonly string[];

export type ComparisonFeatureKey = (typeof COMPARISON_FEATURE_ORDER)[number];

export const COMPARISON_TIER_FEATURE_SETS: Record<ComparisonColumnId, ReadonlySet<string>> = {
  access: new Set(ACCESS_FEATURES),
  insider: new Set(INSIDER_FEATURES),
  vanguard: new Set(VANGUARD_FEATURES),
  founder: new Set(FOUNDER_FEATURES),
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

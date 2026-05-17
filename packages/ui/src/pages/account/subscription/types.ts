import type { SubscriptionStatus, PurchasableProductId } from '@adieuu/shared';

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
}

export interface LifetimeTabProps extends SubscriptionTabProps {
  actionLoading: boolean;
  onCheckout: (product: PurchasableProductId) => void;
}

export interface BillingTabProps {
  status: SubscriptionStatus | null;
  derived: SubscriptionDerivedState;
  identityMode: boolean;
  actionLoading: boolean;
  onManage: () => void | Promise<void>;
}

export interface ManageTabProps extends SubscriptionTabProps {
  actionLoading: boolean;
  statusLabel: string | null;
  onManage: () => void;
  pollPending: boolean;
  onCancelPoll: () => void;
  onCheckout: (product: PurchasableProductId) => void;
}

export const FREE_FEATURES = [
  'messaging',
  'aliases',
  'voiceMessages',
  'mediaSharing',
] as const;

export const ACCESS_FEATURES = [
  ...FREE_FEATURES,
  'prioritySupport',
  'earlyAccess',
] as const;

export const INSIDER_FEATURES = [
  ...ACCESS_FEATURES,
  'extendedMedia',
  'largerUploads',
] as const;

export const LIFETIME_EXTRA_FEATURES = [
  'lifetimeAccess',
  'supporterBadge',
] as const;

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

import type {
  CreatePromoCodeParams,
  PublicPromoCode,
  SubscriptionTierId,
  UpdatePromoCodeParams,
  PromoCodeAudience,
} from '@adieuu/shared';

export type PromoCodeFormState = {
  shortcode: string;
  description: string;
  grantSubscription: boolean;
  subscriptionTier: SubscriptionTierId;
  subscriptionLifetime: boolean;
  subscriptionDurationMonths: string;
  entitlements: string;
  requiredCodes: string;
  incompatibleCodes: string;
  unlimitedUses: boolean;
  maxUses: string;
  jurisdictions: string;
  validFrom: string;
  validTo: string;
  audience: PromoCodeAudience;
};

export const EMPTY_PROMO_FORM: PromoCodeFormState = {
  shortcode: '',
  description: '',
  grantSubscription: false,
  subscriptionTier: 'access',
  subscriptionLifetime: false,
  subscriptionDurationMonths: '12',
  entitlements: '',
  requiredCodes: '',
  incompatibleCodes: '',
  unlimitedUses: true,
  maxUses: '',
  jurisdictions: '',
  validFrom: '',
  validTo: '',
  audience: 'all',
};

export type PromoFormValidationError =
  | 'shortcodeRequired'
  | 'shortcodeInvalid'
  | 'durationInvalid'
  | 'maxUsesInvalid'
  | 'validityRangeInvalid';

export function parseCommaList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

function parseJurisdictionList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const trimmed = part.trim().toUpperCase();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isValidShortcode(value: string): boolean {
  return /^[a-z0-9-]+$/.test(value) && value.length > 0 && value.length <= 32;
}

export function codeToForm(code: PublicPromoCode): PromoCodeFormState {
  return {
    shortcode: code.shortcode,
    description: code.description ?? '',
    grantSubscription: !!code.subscription,
    subscriptionTier: code.subscription?.tier ?? 'access',
    subscriptionLifetime: code.subscription?.durationMonths == null && !!code.subscription,
    subscriptionDurationMonths: String(code.subscription?.durationMonths ?? 12),
    entitlements: code.entitlements.join(', '),
    requiredCodes: code.requiredCodes.join(', '),
    incompatibleCodes: code.incompatibleCodes.join(', '),
    unlimitedUses: code.maxUses === null,
    maxUses: code.maxUses !== null ? String(code.maxUses) : '',
    jurisdictions: code.jurisdictions.join(', '),
    validFrom: toDatetimeLocalValue(code.validFrom),
    validTo: toDatetimeLocalValue(code.validTo),
    audience: code.audience ?? 'all',
  };
}

function buildCommonParams(form: PromoCodeFormState): Omit<CreatePromoCodeParams, 'shortcode'> {
  const durationMonths = parseInt(form.subscriptionDurationMonths, 10);

  return {
    description: form.description.trim() || undefined,
    subscription: form.grantSubscription
      ? {
          tier: form.subscriptionTier,
          durationMonths: form.subscriptionLifetime
            ? null
            : (Number.isFinite(durationMonths) ? durationMonths : 12),
        }
      : undefined,
    entitlements: parseCommaList(form.entitlements),
    requiredCodes: parseCommaList(form.requiredCodes),
    incompatibleCodes: parseCommaList(form.incompatibleCodes),
    maxUses: form.unlimitedUses ? null : parseInt(form.maxUses, 10),
    jurisdictions: parseJurisdictionList(form.jurisdictions),
    validFrom: fromDatetimeLocalValue(form.validFrom),
    validTo: fromDatetimeLocalValue(form.validTo),
    audience: form.audience,
  };
}

export function validatePromoForm(
  form: PromoCodeFormState,
  options?: { requireShortcode?: boolean },
): PromoFormValidationError | null {
  const requireShortcode = options?.requireShortcode ?? true;

  if (requireShortcode) {
    const shortcode = form.shortcode.trim().toLowerCase();
    if (!shortcode) return 'shortcodeRequired';
    if (!isValidShortcode(shortcode)) return 'shortcodeInvalid';
  }

  if (form.grantSubscription && !form.subscriptionLifetime) {
    const months = parseInt(form.subscriptionDurationMonths, 10);
    if (!Number.isFinite(months) || months < 1 || months > 120) {
      return 'durationInvalid';
    }
  }

  if (!form.unlimitedUses) {
    const maxUses = parseInt(form.maxUses, 10);
    if (!Number.isFinite(maxUses) || maxUses < 1) {
      return 'maxUsesInvalid';
    }
  }

  const validFrom = fromDatetimeLocalValue(form.validFrom);
  const validTo = fromDatetimeLocalValue(form.validTo);
  if (validFrom && validTo && new Date(validFrom) > new Date(validTo)) {
    return 'validityRangeInvalid';
  }

  return null;
}

export function formToCreateParams(form: PromoCodeFormState): CreatePromoCodeParams {
  return {
    shortcode: form.shortcode.trim().toLowerCase(),
    ...buildCommonParams(form),
  };
}

export function formToUpdateParams(form: PromoCodeFormState): UpdatePromoCodeParams {
  const common = buildCommonParams(form);
  return {
    ...common,
    subscription: form.grantSubscription ? common.subscription : null,
  };
}

export function formatGrantsSummary(
  code: PublicPromoCode,
  labels: { subscription: (tier: string, months: number) => string; lifetime: (tier: string) => string; none: string },
): string {
  const parts: string[] = [];
  if (code.subscription) {
    if (code.subscription.durationMonths == null) {
      parts.push(labels.lifetime(code.subscription.tier));
    } else {
      parts.push(labels.subscription(code.subscription.tier, code.subscription.durationMonths));
    }
  }
  if (code.entitlements.length) {
    parts.push(code.entitlements.join(', '));
  }
  return parts.length ? parts.join(' · ') : labels.none;
}

export function formatUsesSummary(
  code: PublicPromoCode,
  labels: { unlimited: string },
): string {
  if (code.maxUses === null) {
    return `${code.currentUses} / ${labels.unlimited}`;
  }
  return `${code.currentUses} / ${code.maxUses}`;
}

export function formatValiditySummary(
  code: PublicPromoCode,
  labels: { always: string; openStart: string; openEnd: string },
  formatDate: (iso: string) => string,
): string {
  if (!code.validFrom && !code.validTo) return labels.always;
  if (code.validFrom && code.validTo) {
    return `${formatDate(code.validFrom)} – ${formatDate(code.validTo)}`;
  }
  if (code.validFrom) {
    return `${formatDate(code.validFrom)} – ${labels.openEnd}`;
  }
  return `${labels.openStart} – ${formatDate(code.validTo!)}`;
}

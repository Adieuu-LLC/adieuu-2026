/**
 * Platform settings: validation and auth allowlist checks.
 */

import { ObjectId } from 'mongodb';
import { PLATFORM_SETTING_KEYS } from '../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import type { UpsertPlatformSettingInput } from '../repositories/platform-settings.repository';
import type {
  PlatformSettingValue,
  PlatformSettingValueType,
} from '../models/platform-settings';
import { isValidObjectId } from '../utils/isValidObjectId';
import { sanitizeString } from '../utils/sanitize';
import { getRedis, isRedisConnected } from '../db';
import { RedisKeys } from '../db/redis';
import elog from '../utils/adieuuLogger';

const AUTH_ALLOWLIST_CACHE_TTL_SECONDS = 45;

interface AuthAllowlistState {
  enforced: boolean;
  emailSet: Set<string>;
  phoneSet: Set<string>;
}

async function invalidateAuthAllowlistCache(): Promise<void> {
  if (!isRedisConnected()) return;
  try {
    const redis = getRedis();
    await redis.del(RedisKeys.platformAuthAllowlistCache());
  } catch (err) {
    elog.warn('Failed to invalidate auth allowlist cache', { error: err });
  }
}

async function loadAuthAllowlistState(): Promise<AuthAllowlistState> {
  if (isRedisConnected()) {
    try {
      const redis = getRedis();
      const cached = await redis.get(RedisKeys.platformAuthAllowlistCache());
      if (cached) {
        const p = JSON.parse(cached) as { enforced?: boolean; emails?: string[]; phones?: string[] };
        return {
          enforced: p.enforced === true,
          emailSet: new Set(Array.isArray(p.emails) ? p.emails.filter((e) => typeof e === 'string') : []),
          phoneSet: new Set(Array.isArray(p.phones) ? p.phones.filter((e) => typeof e === 'string') : []),
        };
      }
    } catch {
      // fall through to Mongo
    }
  }

  const repo = getPlatformSettingsRepository();
  const enforcedDoc = await repo.findByKey(PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED);
  const emailDoc = await repo.findByKey(PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL);
  const phoneDoc = await repo.findByKey(PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_PHONE);

  const enforced =
    enforcedDoc?.valueType === 'boolean' && enforcedDoc.value === true;

  const emails =
    emailDoc?.valueType === 'stringArray' && Array.isArray(emailDoc.value)
      ? emailDoc.value.filter((x): x is string => typeof x === 'string')
      : [];

  const phones =
    phoneDoc?.valueType === 'stringArray' && Array.isArray(phoneDoc.value)
      ? phoneDoc.value.filter((x): x is string => typeof x === 'string')
      : [];

  const state: AuthAllowlistState = {
    enforced,
    emailSet: new Set(emails),
    phoneSet: new Set(phones),
  };

  if (isRedisConnected()) {
    try {
      const redis = getRedis();
      await redis.set(
        RedisKeys.platformAuthAllowlistCache(),
        JSON.stringify({
          enforced,
          emails,
          phones,
        }),
        'EX',
        AUTH_ALLOWLIST_CACHE_TTL_SECONDS
      );
    } catch (err) {
      elog.warn('Failed to set auth allowlist cache', { error: err });
    }
  }

  return state;
}

/**
 * When auth allowlist is enforced, returns whether the sanitized identifier may request/verify OTP.
 */
export async function isAuthIdentifierAllowed(
  sanitizedIdentifier: string,
  type: 'email' | 'sms'
): Promise<boolean> {
  const state = await loadAuthAllowlistState();
  if (!state.enforced) {
    return true;
  }

  if (type === 'email') {
    if (state.emailSet.size === 0) {
      elog.warn('Auth allowlist enforced but platform-auth-allowlist-email is empty');
      return false;
    }
    return state.emailSet.has(sanitizedIdentifier);
  }

  if (state.phoneSet.size === 0) {
    elog.warn('Auth allowlist enforced but platform-auth-allowlist-phone is empty');
    return false;
  }
  return state.phoneSet.has(sanitizedIdentifier);
}

/**
 * Validates and coerces JSON body values into stored platform setting values.
 */
export function coercePlatformSettingValue(
  valueType: PlatformSettingValueType,
  raw: unknown
): PlatformSettingValue {
  switch (valueType) {
    case 'boolean':
      if (typeof raw !== 'boolean') {
        throw new Error('value must be a boolean');
      }
      return raw;
    case 'string':
      if (typeof raw !== 'string') {
        throw new Error('value must be a string');
      }
      return raw;
    case 'number':
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        throw new Error('value must be a finite number');
      }
      return raw;
    case 'stringArray':
      if (!Array.isArray(raw) || !raw.every((x) => typeof x === 'string')) {
        throw new Error('value must be an array of strings');
      }
      return raw;
    case 'objectIdArray':
      if (!Array.isArray(raw)) {
        throw new Error('value must be an array');
      }
      const out: ObjectId[] = [];
      for (const item of raw) {
        if (typeof item !== 'string' || !isValidObjectId(item)) {
          throw new Error('value must be an array of 24-character hex ObjectId strings');
        }
        out.push(new ObjectId(item));
      }
      return out;
    default: {
      const _exhaustive: never = valueType;
      throw new Error(`Unsupported value type: ${_exhaustive}`);
    }
  }
}

function normalizeStringArraysForKey(key: string, value: PlatformSettingValue): PlatformSettingValue {
  if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL && Array.isArray(value)) {
    const arr = value as string[];
    return arr.map((e) => sanitizeString(e, 'email').value);
  }
  if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_PHONE && Array.isArray(value)) {
    const arr = value as string[];
    return arr.map((e) => sanitizeString(e, 'phone').value);
  }
  return value;
}

function sanitizeLawLinkRow(row: string): string {
  const idx = row.indexOf('|');
  if (idx === -1) {
    return sanitizeString(row, 'general').value;
  }
  const jurisdiction = sanitizeString(row.slice(0, idx), 'alphanumdash').value;
  const urlPart = sanitizeString(row.slice(idx + 1), 'general').value;
  return `${jurisdiction}|${urlPart}`;
}

/**
 * Applies strictest applicable sanitization after coercion + email/phone array normalization.
 * Exported for unit tests.
 */
export function sanitizePlatformSettingValueAfterCoerce(
  key: string,
  valueType: PlatformSettingValueType,
  value: PlatformSettingValue,
): PlatformSettingValue {
  switch (valueType) {
    case 'boolean':
    case 'number':
      return value;
    case 'string':
      return sanitizePlainSettingString(key, value as string);
    case 'stringArray':
      return sanitizeSettingStringArray(key, value as string[]);
    case 'objectIdArray':
      return value;
    default: {
      const _exhaustive: never = valueType;
      throw new Error(`Unsupported value type: ${_exhaustive}`);
    }
  }
}

function sanitizePlainSettingString(key: string, raw: string): string {
  if (key === PLATFORM_SETTING_KEYS.AGE_VERIFICATION_ACTIVE_PROVIDER) {
    return sanitizeString(raw, 'alphanumdash').value;
  }
  if (
    key === PLATFORM_SETTING_KEYS.AGE_VERIFICATION_VERIFYMY_ENV ||
    key === PLATFORM_SETTING_KEYS.AGE_VERIFICATION_REQUIRED_MODE
  ) {
    return sanitizeString(raw, 'alphanumdash').value;
  }
  return sanitizeString(raw, 'general').value;
}

function sanitizeSettingStringArray(key: string, arr: string[]): string[] {
  if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL || key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_PHONE) {
    return arr;
  }
  if (
    key === PLATFORM_SETTING_KEYS.AGE_VERIFICATION_REQUIRED_JURISDICTIONS ||
    key === PLATFORM_SETTING_KEYS.GEOFENCE_BLOCKED_JURISDICTIONS
  ) {
    return arr.map((s) => sanitizeString(s, 'alphanumdash').value);
  }
  if (key === PLATFORM_SETTING_KEYS.GEOFENCE_LAW_LINKS) {
    return arr.map((row) => sanitizeLawLinkRow(row));
  }
  return arr.map((s) => sanitizeString(s, 'general').value);
}

/** Merge optional incoming description with existing stored description (sanitize incoming only). */
export function mergeUpsertPlatformSettingDescription(
  incoming: string | undefined,
  existingDescription: string | undefined,
): string {
  if (incoming !== undefined) {
    return sanitizeString(incoming, 'general').value;
  }
  return existingDescription ?? '';
}

export interface UpsertPlatformSettingParams {
  key: string;
  description?: string;
  valueType: PlatformSettingValueType;
  value: unknown;
  lastUpdatedBy: string;
}

export async function upsertPlatformSetting(
  params: UpsertPlatformSettingParams
): Promise<void> {
  const repo = getPlatformSettingsRepository();
  const existing = await repo.findByKey(params.key);

  const coerced = coercePlatformSettingValue(params.valueType, params.value);
  const normalized = normalizeStringArraysForKey(params.key, coerced) as PlatformSettingValue;
  const sanitizedValue = sanitizePlatformSettingValueAfterCoerce(
    params.key,
    params.valueType,
    normalized,
  );

  const mergedDescription = mergeUpsertPlatformSettingDescription(
    params.description,
    existing?.description,
  );

  const input: UpsertPlatformSettingInput = {
    key: params.key,
    description: mergedDescription,
    valueType: params.valueType,
    value: sanitizedValue,
    lastUpdatedBy: sanitizeString(params.lastUpdatedBy, 'general').value,
  };

  await repo.upsertByKey(input);
  await invalidateAuthAllowlistCache();
}

const AUTH_ALLOWLIST_SETTING_DEFAULTS: ReadonlyArray<{
  key: string;
  valueType: PlatformSettingValueType;
  value: PlatformSettingValue;
  description: string;
}> = [
  {
    key: PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED,
    valueType: 'boolean',
    value: false,
    description: 'Whether sign-in OTP is restricted to the email/phone allowlists',
  },
  {
    key: PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL,
    valueType: 'stringArray',
    value: [],
    description: 'Email addresses allowed to sign in when allowlist is enforced',
  },
  {
    key: PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_PHONE,
    valueType: 'stringArray',
    value: [],
    description: 'E.164 phone numbers allowed to sign in when allowlist is enforced',
  },
];

/**
 * Creates default `platform_settings` documents for auth allowlist keys when missing.
 * Idempotent: only inserts rows that do not exist.
 */
export async function ensureAuthAllowlistPlatformSettingsExist(lastUpdatedBy: string): Promise<void> {
  const repo = getPlatformSettingsRepository();

  for (const def of AUTH_ALLOWLIST_SETTING_DEFAULTS) {
    const existing = await repo.findByKey(def.key);
    if (!existing) {
      await upsertPlatformSetting({
        key: def.key,
        description: def.description,
        valueType: def.valueType,
        value: def.value,
        lastUpdatedBy,
      });
    }
  }
}

/** Actor id used when inserting default rows during server bootstrap (no user session). */
export const PLATFORM_SETTING_BOOTSTRAP_ACTOR = 'system';

/**
 * Ensures the geo-lookup-enabled setting exists with a `false` default.
 * Idempotent — safe to call on every startup.
 */
export async function ensureGeoLookupPlatformSettingExists(): Promise<void> {
  const repo = getPlatformSettingsRepository();
  const key = PLATFORM_SETTING_KEYS.GEO_LOOKUP_ENABLED;
  const existing = await repo.findByKey(key);
  if (existing) return;

  await upsertPlatformSetting({
    key,
    description: 'Whether IP-based geolocation lookups are enabled',
    valueType: 'boolean',
    value: false,
    lastUpdatedBy: PLATFORM_SETTING_BOOTSTRAP_ACTOR,
  });

  elog.info('Created default geo lookup enabled setting', { key });
}

/**
 * Ensures all age-verification and geofence platform settings exist with defaults.
 * Idempotent -- safe to call on every startup.
 */
export async function ensureAgeVerificationPlatformSettingsExist(): Promise<void> {
  const repo = getPlatformSettingsRepository();

  const defaults: Array<{
    key: string;
    description: string;
    valueType: 'boolean' | 'string' | 'stringArray';
    value: boolean | string | string[];
  }> = [
    {
      key: PLATFORM_SETTING_KEYS.AGE_VERIFICATION_ENABLED,
      description: 'Whether age verification enforcement is active',
      valueType: 'boolean',
      value: false,
    },
    {
      key: PLATFORM_SETTING_KEYS.AGE_VERIFICATION_AUTO_EMAIL_CHECK,
      description:
        'Whether to automatically start a silent email background age check after the user completes first subscription checkout',
      valueType: 'boolean',
      value: false,
    },
    {
      key: PLATFORM_SETTING_KEYS.AGE_VERIFICATION_ACTIVE_PROVIDER,
      description: 'Active age verification provider id',
      valueType: 'string',
      value: 'verifymy',
    },
    {
      key: PLATFORM_SETTING_KEYS.AGE_VERIFICATION_VERIFYMY_ENV,
      description: 'VerifyMy environment (sandbox or production)',
      valueType: 'string',
      value: 'sandbox',
    },
    {
      key: PLATFORM_SETTING_KEYS.AGE_VERIFICATION_REQUIRED_MODE,
      description: 'Enforcement mode: jurisdictions (seed-data-driven) or all',
      valueType: 'string',
      value: 'jurisdictions',
    },
    {
      key: PLATFORM_SETTING_KEYS.AGE_VERIFICATION_REQUIRED_JURISDICTIONS,
      description: 'Additional jurisdictions requiring age verification (additive)',
      valueType: 'stringArray',
      value: [],
    },
    {
      key: PLATFORM_SETTING_KEYS.GEOFENCE_BLOCKED_JURISDICTIONS,
      description: 'Jurisdictions where the service is entirely blocked',
      valueType: 'stringArray',
      value: [],
    },
    {
      key: PLATFORM_SETTING_KEYS.GEOFENCE_LAW_LINKS,
      description: 'Jurisdiction-to-law-URL pairs (format: jurisdiction|url)',
      valueType: 'stringArray',
      value: [],
    },
  ];

  for (const def of defaults) {
    const existing = await repo.findByKey(def.key);
    if (existing) continue;

    await upsertPlatformSetting({
      key: def.key,
      description: def.description,
      valueType: def.valueType,
      value: def.value,
      lastUpdatedBy: PLATFORM_SETTING_BOOTSTRAP_ACTOR,
    });

    elog.info('Created default age verification setting', { key: def.key });
  }
}

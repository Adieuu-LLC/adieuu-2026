/**
 * Platform settings: validation, auth allowlist checks, admin membership.
 */

import { ObjectId } from 'mongodb';
import { PLATFORM_SETTING_KEYS } from '../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import type { UpsertPlatformSettingInput } from '../repositories/platform-settings.repository';
import type {
  PlatformSettingValue,
  PlatformSettingValueType,
} from '../models/platform-settings';
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
 * Whether the user account is in the platform admin list (Mongo ObjectIds).
 * Reads from DB each time — no Redis cache (revocation must be immediate).
 */
export async function isPlatformAdmin(userId: string | ObjectId): Promise<boolean> {
  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.ADMIN_ACCOUNT_LIST);
  if (!doc || doc.valueType !== 'objectIdArray' || !Array.isArray(doc.value)) {
    return false;
  }

  const want = typeof userId === 'string' ? userId.toLowerCase() : userId.toHexString().toLowerCase();

  for (const v of doc.value) {
    if (v instanceof ObjectId) {
      if (v.toHexString().toLowerCase() === want) return true;
    } else if (v && typeof v === 'object' && '_id' in v) {
      // driver-specific ObjectId
      try {
        const oid = v as ObjectId;
        if (oid.toHexString().toLowerCase() === want) return true;
      } catch {
        /* ignore */
      }
    }
  }
  return false;
}

function isValidObjectIdHex(s: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(s);
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
        if (typeof item !== 'string' || !isValidObjectIdHex(item)) {
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

  const input: UpsertPlatformSettingInput = {
    key: params.key,
    description: params.description ?? existing?.description ?? '',
    valueType: params.valueType,
    value: normalized,
    lastUpdatedBy: params.lastUpdatedBy,
  };

  await repo.upsertByKey(input);
  await invalidateAuthAllowlistCache();
}

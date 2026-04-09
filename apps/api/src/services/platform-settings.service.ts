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
 * Whether the identity is in the platform admin list (Mongo ObjectIds).
 * Reads from DB each time — no Redis cache (revocation must be immediate).
 */
export async function isPlatformAdmin(identityId: string | ObjectId): Promise<boolean> {
  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.ADMIN_IDENTITY_LIST);

  if (!doc) {
    elog.warn('No platform admin list found.');
    return false;
  }

  if (doc.valueType !== 'objectIdArray' || !Array.isArray(doc.value)) {
    elog.warn('Platform admin list found, but appears invalid. Make sure it is an array of ObjectIds');
    return false;
  }

  const currentId = typeof identityId === 'string' ? identityId.toLowerCase() : identityId.toHexString().toLowerCase();

  for (const adminlistEntry of doc.value) {
    if (adminlistEntry instanceof ObjectId) {
      if (adminlistEntry.toHexString().toLowerCase() === currentId) return true;
      continue;
    }
    if (typeof adminlistEntry === 'string') {
      if (isValidObjectId(adminlistEntry) && adminlistEntry.toLowerCase() === currentId) {
        return true;
      }
      continue;
    }
    if (adminlistEntry && typeof adminlistEntry === 'object' && '_id' in adminlistEntry) {
      try {
        const oid = adminlistEntry as ObjectId;
        if (oid.toHexString().toLowerCase() === currentId) return true;
      } catch {
        elog.warn('Invalid ObjectId in platform admin list', { value: adminlistEntry });
      }
    }
  }
  return false;
}

/**
 * Whether the identity is in the platform moderator list.
 * Same semantics as isPlatformAdmin — reads from DB each time.
 */
export async function isPlatformModerator(identityId: string | ObjectId): Promise<boolean> {
  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.MODERATOR_IDENTITY_LIST);

  if (!doc) return false;

  if (doc.valueType !== 'objectIdArray' || !Array.isArray(doc.value)) {
    elog.warn('Platform moderator list found, but appears invalid.');
    return false;
  }

  const currentId = typeof identityId === 'string' ? identityId.toLowerCase() : identityId.toHexString().toLowerCase();

  for (const entry of doc.value) {
    if (entry instanceof ObjectId) {
      if (entry.toHexString().toLowerCase() === currentId) return true;
      continue;
    }
    if (typeof entry === 'string') {
      if (isValidObjectId(entry) && entry.toLowerCase() === currentId) return true;
      continue;
    }
    if (entry && typeof entry === 'object' && '_id' in entry) {
      try {
        const oid = entry as ObjectId;
        if (oid.toHexString().toLowerCase() === currentId) return true;
      } catch {
        elog.warn('Invalid ObjectId in platform moderator list', { value: entry });
      }
    }
  }
  return false;
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
 * Ensures the platform admin identity list setting exists with an empty list.
 * Call once after MongoDB is available (e.g. server startup). Idempotent.
 */
export async function ensureAdminIdentityListPlatformSettingExists(): Promise<void> {
  const repo = getPlatformSettingsRepository();
  const key = PLATFORM_SETTING_KEYS.ADMIN_IDENTITY_LIST;
  const existing = await repo.findByKey(key);
  if (existing) {
    return;
  }

  await upsertPlatformSetting({
    key,
    description: 'Platform administrator identity IDs',
    valueType: 'objectIdArray',
    value: [],
    lastUpdatedBy: PLATFORM_SETTING_BOOTSTRAP_ACTOR,
  });

  elog.info('Created default platform admin list setting', { key });
}

/**
 * Ensures the platform moderator identity list setting exists with an empty list.
 * Idempotent — safe to call on every startup.
 */
export async function ensureModeratorIdentityListPlatformSettingExists(): Promise<void> {
  const repo = getPlatformSettingsRepository();
  const key = PLATFORM_SETTING_KEYS.MODERATOR_IDENTITY_LIST;
  const existing = await repo.findByKey(key);
  if (existing) return;

  await upsertPlatformSetting({
    key,
    description: 'Platform moderator identity IDs',
    valueType: 'objectIdArray',
    value: [],
    lastUpdatedBy: PLATFORM_SETTING_BOOTSTRAP_ACTOR,
  });

  elog.info('Created default platform moderator list setting', { key });
}

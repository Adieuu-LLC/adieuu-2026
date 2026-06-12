/**
 * IP geolocation service.
 *
 * Public API consumed by the auth layer:
 * - resolveJurisdiction(ip) — Redis-cached IP→jurisdiction lookup.
 * - refreshUserGeoIfStale(user, ip) — updates user.geo at most once per
 *   recheckIntervalDays or when the source IP changes.
 *
 * Never throws: callers receive null on any failure and decide how to
 * degrade (fail-open or fail-closed is a policy decision, not ours).
 */

import { createHash } from 'crypto';
import { config } from '../../config';
import { getRedis, isRedisConnected, RedisKeys } from '../../db/redis';
import { getUserRepository } from '../../repositories/user.repository';
import type { UserDocument, UserGeo } from '../../models/user';
import { lookupIp } from './iplocate.client';
import { fromIpLocateResult } from './jurisdiction';
import { isGeoLookupEnabled } from './geo-settings';
import elog from '../../utils/adieuuLogger';

const NEGATIVE_CACHE_TTL_SECONDS = 300;

export interface ResolvedGeoLookup {
  jurisdiction: string;
  countryCode: string;
  regionCode?: string;
  isAnonymous?: boolean;
  isAbuser?: boolean;
}

let trustProxyWarningLogged = false;

/**
 * Hash an IP using the account-hash secret so raw IPs never land in
 * Redis or the user document.
 */
export function hashIpForGeo(ip: string): string {
  return createHash('sha256')
    .update(`${ip}:${config.security.accountHashSecret}`)
    .digest('hex');
}

/**
 * Resolves an IP to a jurisdiction code. The lookup chain is:
 *   1. Redis positive cache (24h TTL).
 *   2. Redis negative cache (5 min TTL) — avoids hammering IPLocate.
 *   3. IPLocate.io API.
 *
 * Returns null without throwing on any failure.
 */
export async function resolveJurisdiction(
  ip: string,
): Promise<ResolvedGeoLookup | null> {
  if (config.env === 'production' && !config.geo.trustProxyHeaders) {
    if (!trustProxyWarningLogged) {
      elog.warn(
        'Geo lookup skipped: TRUST_PROXY_HEADERS is false in production. ' +
        'IP-derived jurisdiction would be unreliable.',
      );
      trustProxyWarningLogged = true;
    }
    return null;
  }

  const ipHash = hashIpForGeo(ip);

  if (isRedisConnected()) {
    try {
      const redis = getRedis();

      const cached = await redis.get(RedisKeys.geoIpLookup(ipHash));
      if (cached) {
        return JSON.parse(cached) as {
          jurisdiction: string;
          countryCode: string;
          regionCode?: string;
        };
      }

      const neg = await redis.get(RedisKeys.geoNegativeLookup(ipHash));
      if (neg) {
        return null;
      }
    } catch (err) {
      elog.warn('Redis read failed during geo lookup', { error: err });
    }
  }

  const raw = await lookupIp(ip);
  if (!raw) {
    if (isRedisConnected()) {
      try {
        const redis = getRedis();
        await redis.set(
          RedisKeys.geoNegativeLookup(ipHash),
          '1',
          'EX',
          NEGATIVE_CACHE_TTL_SECONDS,
        );
      } catch {
        // best-effort
      }
    }
    return null;
  }

  const result = fromIpLocateResult(raw);
  if (!result) return null;

  const lookup: ResolvedGeoLookup = {
    jurisdiction: result.jurisdiction,
    countryCode: result.countryCode,
    regionCode: result.regionCode,
    isAnonymous: raw.privacy?.isAnonymous ?? undefined,
    isAbuser: raw.privacy?.isAbuser ?? undefined,
  };

  if (isRedisConnected()) {
    try {
      const redis = getRedis();
      await redis.set(
        RedisKeys.geoIpLookup(ipHash),
        JSON.stringify(lookup),
        'EX',
        config.geo.cacheTtlSeconds,
      );
    } catch {
      // best-effort
    }
  }

  return lookup;
}

/**
 * Refreshes the geo data on a user document if stale or if the source
 * IP has changed since the last check.
 *
 * "Stale" means either:
 *   - user.geo is absent, or
 *   - checkedAt is older than recheckIntervalDays, or
 *   - the hashed IP differs (user is on a new network).
 *
 * Returns the (possibly updated) UserGeo or null on failure.
 * Never throws.
 */
export async function refreshUserGeoIfStale(
  user: UserDocument,
  ip: string,
): Promise<UserGeo | null> {
  try {
    const enabled = await isGeoLookupEnabled();
    if (!enabled) return user.geo ?? null;

    const ipHash = hashIpForGeo(ip);
    const now = Date.now();

    if (user.geo) {
      const ageMs = now - user.geo.checkedAt.getTime();
      const recheckMs = config.geo.recheckIntervalDays * 24 * 60 * 60 * 1000;

      if (ageMs < recheckMs && user.geo.ipHash === ipHash) {
        return user.geo;
      }
    }

    const resolved = await resolveJurisdiction(ip);
    if (!resolved) {
      return user.geo ?? null;
    }

    const geo: UserGeo = {
      jurisdiction: resolved.jurisdiction,
      countryCode: resolved.countryCode,
      regionCode: resolved.regionCode,
      ipHash,
      checkedAt: new Date(),
      isAnonymous: resolved.isAnonymous,
      isAbuser: resolved.isAbuser,
    };

    const repo = getUserRepository();
    await repo.updateGeo(user._id, geo);

    return geo;
  } catch (err) {
    elog.warn('refreshUserGeoIfStale failed', {
      error: err,
      userId: user._id?.toString(),
    });
    return user.geo ?? null;
  }
}

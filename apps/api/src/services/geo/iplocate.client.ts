/**
 * Bare HTTP client for IPLocate.io.
 *
 * Single responsibility: turn an IP string into a minimal
 * {countryCode, regionCode?, regionName?, city?} result or null.
 * No business logic, no caching — callers handle that.
 */

import { config } from '../../config';
import elog from '../../utils/adieuuLogger';

export interface IpLocateResult {
  countryCode: string;
  /** Full subdivision name as returned by IPLocate (e.g. "Tennessee") */
  subdivisionName?: string;
  city?: string;
}

/**
 * Queries IPLocate.io for geo data associated with the given IP.
 *
 * Returns `null` on any failure (non-200, network, parse, timeout)
 * so the caller can decide whether to cache a negative result, retry,
 * or proceed without geo data.
 */
export async function lookupIp(ip: string): Promise<IpLocateResult | null> {
  const { baseUrl, apiKey, timeoutMs } = config.geo.iplocate;

  try {
    const url = new URL(`${baseUrl}/${encodeURIComponent(ip)}`);
    if (apiKey) {
      url.searchParams.set('apikey', apiKey);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      elog.warn('IPLocate non-200 response', {
        status: response.status,
        ipPrefix: ip.substring(0, ip.indexOf('.', ip.indexOf('.') + 1)),
      });
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;

    const countryCode = typeof data.country_code === 'string' ? data.country_code : '';
    if (!countryCode) {
      return null;
    }

    return {
      countryCode,
      subdivisionName: typeof data.subdivision === 'string' ? data.subdivision : undefined,
      city: typeof data.city === 'string' ? data.city : undefined,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      elog.warn('IPLocate request timed out', { timeoutMs });
    } else {
      elog.warn('IPLocate request failed', { error: err });
    }
    return null;
  }
}

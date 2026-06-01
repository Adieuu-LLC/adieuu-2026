/**
 * Client-side unfurl service for fetching link embed metadata.
 *
 * Caches responses in-memory to avoid redundant API calls for the same URL
 * across re-renders.
 *
 * @module services/unfurlService
 */

import type { LinkMetadata } from '../components/embeds/GenericLinkEmbed';

const metadataCache = new Map<string, { data: LinkMetadata | null; fetchedAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes client-side
const inflight = new Map<string, Promise<LinkMetadata | null>>();

function getCached(url: string): LinkMetadata | null | undefined {
  const entry = metadataCache.get(url);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    metadataCache.delete(url);
    return undefined;
  }
  return entry.data;
}

export function createUnfurlFetcher(apiBaseUrl: string): (url: string) => Promise<LinkMetadata | null> {
  return async function fetchUnfurlMetadata(url: string): Promise<LinkMetadata | null> {
    const cached = getCached(url);
    if (cached !== undefined) return cached;

    // Deduplicate in-flight requests for the same URL
    const existing = inflight.get(url);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const endpoint = `${apiBaseUrl}/api/unfurl?url=${encodeURIComponent(url)}`;
        const res = await fetch(endpoint, {
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        });

        if (!res.ok) {
          metadataCache.set(url, { data: null, fetchedAt: Date.now() });
          return null;
        }

        const json = await res.json();
        const metadata: LinkMetadata | null = json?.data?.metadata ?? null;
        metadataCache.set(url, { data: metadata, fetchedAt: Date.now() });
        return metadata;
      } catch {
        metadataCache.set(url, { data: null, fetchedAt: Date.now() });
        return null;
      } finally {
        inflight.delete(url);
      }
    })();

    inflight.set(url, promise);
    return promise;
  };
}

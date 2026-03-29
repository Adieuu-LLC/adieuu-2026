/**
 * Hook for fetching the public releases manifest from the downloads CDN.
 *
 * Returns the latest release entry (or all entries) from releases.json,
 * including per-platform download URLs, version, date, and SBOM/GitHub links.
 */

import { useState, useEffect } from 'react';

export interface ReleaseDownload {
  filename: string;
  url: string;
  arch: string;
  format: string;
}

export interface ReleaseEntry {
  version: string;
  date: string;
  downloads: {
    windows: ReleaseDownload[];
    mac: ReleaseDownload[];
    linux: ReleaseDownload[];
  };
  sboms: string;
  github: string;
}

export interface UseReleasesResult {
  latest: ReleaseEntry | null;
  releases: ReleaseEntry[];
  loading: boolean;
  error: string | null;
}

function getBaseUrl(): string {
  if (typeof __DOWNLOADS_BASE_URL__ !== 'undefined' && __DOWNLOADS_BASE_URL__) {
    return __DOWNLOADS_BASE_URL__;
  }
  return 'https://downloads.adieuu.com';
}

export function useReleases(): UseReleasesResult {
  const [releases, setReleases] = useState<ReleaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchReleases() {
      try {
        const url = `${getBaseUrl()}/releases.json`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data: unknown = await res.json();
        if (!Array.isArray(data)) {
          throw new Error('Unexpected response format');
        }
        if (!cancelled) {
          setReleases(data as ReleaseEntry[]);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load releases');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchReleases();

    return () => {
      cancelled = true;
    };
  }, []);

  const latest = releases.length > 0 ? releases[0] : null;

  return { latest, releases, loading, error };
}

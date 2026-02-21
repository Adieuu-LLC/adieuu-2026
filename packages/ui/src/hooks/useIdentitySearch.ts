/**
 * Hook for searching identities with debouncing.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { createApiClient, type PublicIdentity } from '@adieuu/shared';
import { useAppConfig } from '../config';

export interface UseIdentitySearchOptions {
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Maximum results to fetch (default: 10) */
  limit?: number;
  /** Minimum query length to trigger search (default: 2) */
  minQueryLength?: number;
}

export interface UseIdentitySearchResult {
  /** Current search results */
  results: PublicIdentity[];
  /** Whether a search is in progress */
  isLoading: boolean;
  /** Error message if search failed */
  error: string | null;
  /** Perform a search with debouncing */
  search: (query: string) => void;
  /** Clear search results */
  clear: () => void;
  /** Current search query */
  query: string;
}

const DEFAULT_OPTIONS: Required<UseIdentitySearchOptions> = {
  debounceMs: 300,
  limit: 10,
  minQueryLength: 2,
};

export function useIdentitySearch(
  options: UseIdentitySearchOptions = {}
): UseIdentitySearchResult {
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const opts = { ...DEFAULT_OPTIONS, ...options };

  const [results, setResults] = useState<PublicIdentity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setResults([]);
    setError(null);
    setQuery('');
    setIsLoading(false);
  }, []);

  const search = useCallback(
    (searchQuery: string) => {
      const trimmedQuery = searchQuery.trim();
      console.log('Search called with:', trimmedQuery);
      setQuery(trimmedQuery);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (trimmedQuery.length < opts.minQueryLength) {
        setResults([]);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      debounceTimerRef.current = setTimeout(async () => {
        abortControllerRef.current = new AbortController();

        try {
          const response = await api.identity.search(trimmedQuery, opts.limit);

          if (response.success && response.data) {
            setResults(response.data);
            setError(null);
          } else {
            setResults([]);
            setError(response.error ?? 'Search failed');
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            return;
          }
          setResults([]);
          setError('Search failed');
        } finally {
          setIsLoading(false);
        }
      }, opts.debounceMs);
    },
    [api, opts.debounceMs, opts.limit, opts.minQueryLength]
  );

  return {
    results,
    isLoading,
    error,
    search,
    clear,
    query,
  };
}

/**
 * GIF / Sticker picker popover content.
 *
 * Features:
 *  - Tabs for GIFs and Stickers (Ark UI Tabs)
 *  - Debounced search input (400ms)
 *  - 2-column masonry grid (150px thumbnails, sm.webp via Klipy CDN)
 *  - base64 blur_preview placeholders while images load
 *  - Infinite scroll via IntersectionObserver
 *  - Rate limit banner from 429 responses
 *  - "Powered by KLIPY" attribution (required by ToS)
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type CSSProperties,
} from 'react';
import { Tabs } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  type KlipyItem,
  type KlipySearchResponse,
} from '@adieuu/shared';
import { useAppConfig } from '../config/PlatformContext';
import type { GifAttachment } from '../services/messagePayload';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GifPickerProps {
  onGifSelect: (gif: GifAttachment) => void;
}

type ContentTab = 'gifs' | 'stickers';

interface FetchState {
  items: KlipyItem[];
  page: number;
  hasNext: boolean;
  loading: boolean;
  error: string | null;
  rateLimitRetryAfter: number | null;
}

const INITIAL_STATE: FetchState = {
  items: [],
  page: 0,
  hasNext: true,
  loading: true,
  error: null,
  rateLimitRetryAfter: null,
};

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;
const COLUMN_WIDTH = 150;
const GAP = 8;
const PER_PAGE = 6;

const THROTTLE_WINDOW_MS = 2_500;
const THROTTLE_MAX_PAGES = 3;
const THROTTLE_COOLDOWN_MS = 3_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GifPicker({ onGifSelect }: GifPickerProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [tab, setTab] = useState<ContentTab>('gifs');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [state, setState] = useState<FetchState>(INITIAL_STATE);

  const gridRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const fetchId = useRef(0);
  const pageFetchTimestamps = useRef<number[]>([]);
  const throttleTimer = useRef<ReturnType<typeof setTimeout>>();
  const [throttled, setThrottled] = useState(false);

  // -------------------------------------------------------------------------
  // Debounce search input
  // -------------------------------------------------------------------------
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const trimmed = query.trim();
      setDebouncedQuery(trimmed.length >= MIN_QUERY_LENGTH ? trimmed : '');
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceTimer.current);
  }, [query]);

  // -------------------------------------------------------------------------
  // Reset state when tab or query changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    setState(INITIAL_STATE);
    setSearchTerm(debouncedQuery);
    setThrottled(false);
    pageFetchTimestamps.current = [];
    clearTimeout(throttleTimer.current);
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }, [tab, debouncedQuery]);

  // -------------------------------------------------------------------------
  // Fetch results
  // -------------------------------------------------------------------------
  const fetchPage = useCallback(
    async (pageToFetch: number) => {
      const id = ++fetchId.current;
      setState((prev) => ({ ...prev, loading: true, error: null, rateLimitRetryAfter: null }));

      try {
        const isSearch = debouncedQuery.length > 0;
        let res: Awaited<ReturnType<typeof api.klipy.searchGifs>>;

        if (tab === 'gifs') {
          res = isSearch
            ? await api.klipy.searchGifs({ q: debouncedQuery, page: pageToFetch, per_page: PER_PAGE })
            : await api.klipy.trendingGifs({ page: pageToFetch, per_page: PER_PAGE });
        } else {
          res = isSearch
            ? await api.klipy.searchStickers({ q: debouncedQuery, page: pageToFetch, per_page: PER_PAGE })
            : await api.klipy.trendingStickers({ page: pageToFetch, per_page: PER_PAGE });
        }

        if (id !== fetchId.current) return;

        if (res.success && res.data) {
          const data = res.data as KlipySearchResponse;
          setState((prev) => ({
            items: pageToFetch === 1 ? data.items : [...prev.items, ...data.items],
            page: data.currentPage,
            hasNext: data.hasNext,
            loading: false,
            error: null,
            rateLimitRetryAfter: null,
          }));
        } else {
          const errorBody = res as { error?: { code?: string; message?: string } };
          if (errorBody.error?.code === 'TIMEOUT') {
            setState((prev) => ({ ...prev, loading: false, error: t('gif.error') }));
          } else {
            setState((prev) => ({ ...prev, loading: false, error: t('gif.error') }));
          }
        }
      } catch (err: unknown) {
        if (id !== fetchId.current) return;
        const resp = err as { status?: number; retryAfter?: number };
        if (resp.status === 429 || (typeof resp.retryAfter === 'number')) {
          setState((prev) => ({
            ...prev,
            loading: false,
            rateLimitRetryAfter: resp.retryAfter ?? 30,
          }));
        } else {
          setState((prev) => ({ ...prev, loading: false, error: t('gif.error') }));
        }
      }
    },
    [api.klipy, debouncedQuery, tab, t]
  );

  // Initial load + query/tab change
  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  // -------------------------------------------------------------------------
  // Infinite scroll via IntersectionObserver
  // -------------------------------------------------------------------------
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          !entry?.isIntersecting ||
          !state.hasNext ||
          state.loading ||
          state.error ||
          state.rateLimitRetryAfter ||
          throttled
        ) return;

        const now = Date.now();
        const recent = pageFetchTimestamps.current.filter(
          (ts) => now - ts < THROTTLE_WINDOW_MS,
        );
        pageFetchTimestamps.current = recent;

        if (recent.length >= THROTTLE_MAX_PAGES) {
          setThrottled(true);
          clearTimeout(throttleTimer.current);
          throttleTimer.current = setTimeout(() => {
            pageFetchTimestamps.current = [];
            setThrottled(false);
          }, THROTTLE_COOLDOWN_MS);
          return;
        }

        pageFetchTimestamps.current.push(now);
        fetchPage(state.page + 1);
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchPage, state.hasNext, state.loading, state.page, state.error, state.rateLimitRetryAfter, throttled]);

  useEffect(() => {
    return () => clearTimeout(throttleTimer.current);
  }, []);

  // -------------------------------------------------------------------------
  // Masonry layout computation
  // -------------------------------------------------------------------------
  const { positions, totalHeight } = useMemo(() => {
    const colHeights = [0, 0];
    const pos = state.items.map((item) => {
      const aspect = item.previewWidth && item.previewHeight
        ? item.previewWidth / item.previewHeight
        : 1;
      const h = Math.round(COLUMN_WIDTH / aspect);
      const col = colHeights[0]! <= colHeights[1]! ? 0 : 1;
      const top = colHeights[col]!;
      const left = col * (COLUMN_WIDTH + GAP);
      colHeights[col]! += h + GAP;
      return { top, left, width: COLUMN_WIDTH, height: h };
    });
    return { positions: pos, totalHeight: Math.max(colHeights[0]!, colHeights[1]!, 0) };
  }, [state.items]);

  // -------------------------------------------------------------------------
  // Item click handler
  // -------------------------------------------------------------------------
  const handleSelect = useCallback(
    (item: KlipyItem) => {
      const gif: GifAttachment = {
        provider: 'klipy',
        type: item.type,
        url: item.url,
        previewUrl: item.previewUrl,
        tinyUrl: item.tinyUrl,
        blurPreview: item.blurPreview,
        width: item.width,
        height: item.height,
        searchTerm: searchTerm || '',
        title: item.title || undefined,
        slug: item.slug,
      };
      onGifSelect(gif);
    },
    [onGifSelect, searchTerm]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="gif-picker">
      <Tabs.Root
        value={tab}
        onValueChange={(d) => setTab(d.value as ContentTab)}
      >
        <Tabs.List className="gif-picker__tabs">
          <Tabs.Trigger className="gif-picker__tab" value="gifs">
            {t('gif.tabGifs')}
          </Tabs.Trigger>
          <Tabs.Trigger className="gif-picker__tab" value="stickers">
            {t('gif.tabStickers')}
          </Tabs.Trigger>
          <Tabs.Indicator className="gif-picker__tab-indicator" />
        </Tabs.List>
      </Tabs.Root>

      <input
        className="gif-picker__search"
        type="text"
        placeholder={t('gif.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {state.rateLimitRetryAfter !== null && (
        <div className="gif-picker__rate-limit">
          {t('gif.rateLimited', { seconds: state.rateLimitRetryAfter })}
        </div>
      )}

      <div className="gif-picker__grid" ref={gridRef}>
        {state.items.length > 0 && (
          <div className="gif-picker__masonry" style={{ height: totalHeight }}>
            {state.items.map((item, i) => (
              <GifPickerTile
                key={item.id}
                item={item}
                onClick={handleSelect}
                position={positions[i]!}
              />
            ))}
          </div>
        )}

        {state.items.length === 0 && state.loading && (
          <div className="gif-picker__placeholder-grid">
            <div className="gif-picker__placeholder" />
            <div className="gif-picker__placeholder" />
            <div className="gif-picker__placeholder" />
            <div className="gif-picker__placeholder" />
            <div className="gif-picker__placeholder" />
            <div className="gif-picker__placeholder" />
          </div>
        )}

        {state.items.length > 0 && (state.loading || throttled) && (
          <div className="gif-picker__page-loader">
            <div className="gif-picker__spinner" />
          </div>
        )}

        {!state.loading && !throttled && !state.error && state.items.length === 0 && (
          <div className="gif-picker__empty">
            {debouncedQuery
              ? t('gif.noResults', { query: debouncedQuery })
              : t('gif.loading')}
          </div>
        )}

        {state.error && (
          <div className="gif-picker__error">
            {state.error}
            <button
              className="gif-picker__retry"
              onClick={() => fetchPage(state.page || 1)}
            >
              {t('gif.retryButton', 'Retry')}
            </button>
          </div>
        )}

        <div ref={sentinelRef} className="gif-picker__sentinel" />
      </div>

      <div className="gif-picker__attribution">
        <img
          src="/img/klipy/viewer-logo.svg"
          alt={t('gif.poweredBy')}
          className="gif-picker__attribution-logo"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tile sub-component
// ---------------------------------------------------------------------------

interface TilePosition { top: number; left: number; width: number; height: number }

function GifPickerTile({
  item,
  onClick,
  position,
}: {
  item: KlipyItem;
  onClick: (item: KlipyItem) => void;
  position: TilePosition;
}) {
  const [loaded, setLoaded] = useState(false);

  const style: CSSProperties = {
    position: 'absolute',
    top: position.top,
    left: position.left,
    width: position.width,
    height: position.height,
    backgroundImage: item.blurPreview ? `url(${item.blurPreview})` : undefined,
    backgroundSize: 'cover',
  };

  return (
    <button
      type="button"
      className="gif-picker__tile"
      style={style}
      onClick={() => onClick(item)}
      aria-label={item.title || 'GIF'}
    >
      <img
        src={item.previewUrl}
        alt={item.title || ''}
        width={position.width}
        height={position.height}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`gif-picker__tile-img${loaded ? ' gif-picker__tile-img--loaded' : ''}`}
      />
    </button>
  );
}

export default GifPicker;

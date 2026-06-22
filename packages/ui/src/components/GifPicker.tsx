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
  useLayoutEffect,
  useMemo,
  type CSSProperties,
} from 'react';
import { Switch, Tabs } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  type KlipyItem,
  type KlipySearchResponse,
} from '@adieuu/shared';
import { useAppConfig } from '../config/PlatformContext';
import { useGifSendNow } from '../hooks/useGifPreference';
import { Tooltip } from './Tooltip';
import type { GifAttachment } from '../services/messagePayload';
import { klipyItemToGifAttachment, routeGifSelection } from './gifPickerSelection';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentTab = 'gifs' | 'stickers';

export interface GifPickerProps {
  onGifSelect: (gif: GifAttachment) => void;
  /** Called when the "Send Now" toggle is on and a GIF is selected. */
  onGifSendNow?: (gif: GifAttachment) => void;
  /** Which tab to show on mount. Defaults to `'gifs'`. */
  initialTab?: ContentTab;
  /** Fired when the user switches between the GIF and Sticker tabs. */
  onTabChange?: (tab: ContentTab) => void;
  /** Plain-text of the most recent message; used to seed a search when the
   *  sticker tab opens with an empty query. */
  lastMessageText?: string;
  /** Conversation ID for server-side content filter enforcement. */
  conversationId?: string;
}

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

/** Stickers: no default grid without a search query — avoid loading trending + bogus empty copy. */
const STICKERS_BROWSE_IDLE: FetchState = {
  items: [],
  page: 0,
  hasNext: false,
  loading: false,
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

const STOPWORDS = new Set([
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'its',
  'they', 'them', 'their', 'this', 'that', 'these', 'those', 'am', 'is',
  'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may',
  'might', 'must', 'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'not',
  'no', 'so', 'if', 'of', 'at', 'by', 'for', 'in', 'on', 'to', 'up',
  'as', 'with', 'from', 'into', 'about', 'just', 'very', 'too', 'also',
  'than', 'then', 'here', 'there', 'when', 'where', 'how', 'what', 'who',
  'which', 'all', 'each', 'some', 'any', 'many', 'much', 'own', 'same',
  'other', 'such', 'only', 'both', 'few', 'more', 'most', 'out', 'over',
  'oh', 'ok', 'okay', 'yeah', 'yes', 'no', 'hey', 'hi', 'hello', 'bye',
  'lol', 'lmao', 'haha', 'hmm', 'um', 'uh', 'like', 'gonna', 'gotta',
  'really', 'actually', 'basically', 'literally', 'maybe', 'probably',
]);

/** Extract the best keyword (likely a noun or verb) from a message. */
function extractKeyword(text: string): string {
  const words = text
    .replace(/[^\p{L}\p{N}\s'-]/gu, '')
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  if (words.length === 0) return '';
  return words.reduce((best, w) => (w.length > best.length ? w : best), words[0]!);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GifPicker({ onGifSelect, onGifSendNow, initialTab, onTabChange, lastMessageText, conversationId }: GifPickerProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const [sendNow, setSendNow] = useGifSendNow();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [tab, setTab] = useState<ContentTab>(initialTab ?? 'gifs');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [state, setState] = useState<FetchState>(() =>
    (initialTab ?? 'gifs') === 'stickers' ? STICKERS_BROWSE_IDLE : INITIAL_STATE,
  );
  const appliedSeedRef = useRef(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const fetchId = useRef(0);
  const pageFetchTimestamps = useRef<number[]>([]);
  const throttleTimer = useRef<ReturnType<typeof setTimeout>>();
  const [throttled, setThrottled] = useState(false);

  // Focus search after mount so it wins over popover / tab triggers (autoFocus alone is unreliable).
  useLayoutEffect(() => {
    const el = searchInputRef.current;
    if (!el) return;
    const focusSearch = () => el.focus({ preventScroll: true });
    focusSearch();
    const t = window.setTimeout(focusSearch, 0);
    return () => clearTimeout(t);
  }, []);

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
  // Seed sticker search from the most recent message (once per mount)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (appliedSeedRef.current) return;
    if (tab !== 'stickers' || query.length > 0) return;
    if (!lastMessageText) return;
    const keyword = extractKeyword(lastMessageText);
    if (!keyword) return;
    appliedSeedRef.current = true;
    setQuery(keyword);
  }, [tab, query, lastMessageText]);

  // -------------------------------------------------------------------------
  // Reset state when tab or query changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    setState(
      tab === 'stickers' && debouncedQuery === '' ? STICKERS_BROWSE_IDLE : INITIAL_STATE,
    );
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
      if (tab === 'stickers' && debouncedQuery.length === 0) {
        return;
      }

      const id = ++fetchId.current;
      setState((prev) => ({ ...prev, loading: true, error: null, rateLimitRetryAfter: null }));

      try {
        const isSearch = debouncedQuery.length > 0;
        let res: Awaited<ReturnType<typeof api.klipy.searchGifs>>;

        if (tab === 'gifs') {
          res = isSearch
            ? await api.klipy.searchGifs({ q: debouncedQuery, page: pageToFetch, per_page: PER_PAGE, conversationId })
            : await api.klipy.trendingGifs({ page: pageToFetch, per_page: PER_PAGE, conversationId });
        } else {
          res = await api.klipy.searchStickers({
            q: debouncedQuery,
            page: pageToFetch,
            per_page: PER_PAGE,
            conversationId,
          });
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
    [api.klipy, debouncedQuery, tab, t, conversationId]
  );

  // Initial load + query/tab change (stickers without a search query: idle CTA only)
  useEffect(() => {
    if (tab === 'stickers' && debouncedQuery === '') return;
    fetchPage(1);
  }, [fetchPage, tab, debouncedQuery]);

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
      const gif = klipyItemToGifAttachment(item, searchTerm);
      routeGifSelection({ sendNow, gif, onGifSelect, onGifSendNow });
    },
    [onGifSelect, onGifSendNow, sendNow, searchTerm]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="gif-picker">
      <Tabs.Root
        value={tab}
        onValueChange={(d) => {
          const next = d.value as ContentTab;
          setTab(next);
          onTabChange?.(next);
        }}
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
        ref={searchInputRef}
        className="gif-picker__search"
        type="text"
        placeholder={t('gif.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
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
              : tab === 'stickers'
                ? t(
                    'gif.stickersSearchPrompt',
                    'Type at least two characters in the search box to find stickers.',
                  )
                : t(
                    'gif.trendingGifsEmpty',
                    'No trending GIFs right now. Try searching above.',
                  )}
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
        <Tooltip content={t('gif.sendNowHint')} position="top" className="tooltip--multiline">
          <span className="gif-picker__send-now-wrap">
            <Switch.Root
              checked={sendNow}
              onCheckedChange={(d) => setSendNow(d.checked)}
              className="gif-picker__send-now"
            >
              <Switch.Label className="gif-picker__send-now-label">
                {t('gif.sendNow')}
              </Switch.Label>
              <Switch.Control className="sidebar-filter-switch-control">
                <Switch.Thumb className="sidebar-filter-switch-thumb" />
              </Switch.Control>
              <Switch.HiddenInput />
            </Switch.Root>
          </span>
        </Tooltip>
        <Tooltip
          content={
            <>
              <p>{t('gif.klipyHintP1')}</p>
              <p>{t('gif.klipyHintP2')}</p>
            </>
          }
          position="top"
          className="tooltip--multiline"
        >
          <img
            src="/img/klipy/viewer-logo.svg"
            alt={t('gif.poweredBy')}
            className="gif-picker__attribution-logo"
          />
        </Tooltip>
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

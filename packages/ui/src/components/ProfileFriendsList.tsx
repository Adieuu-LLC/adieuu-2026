/**
 * Friends list panel for profile content tabs.
 *
 * Supports two modes:
 * - **Fetched mode** (profile view): owns data fetching with cursor-based
 *   pagination and debounced server-side search. Activated when `fetchFriends`
 *   is provided.
 * - **Static mode** (profile editor preview): receives `friends` prop and
 *   does client-side filtering only.
 *
 * Shows a placeholder when the list is hidden by privacy settings or empty.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { FriendInfo, FriendshipStatusResult } from '@adieuu/shared';
import { IdentityCard } from './IdentityCard';
import { Input } from './Input';
import { Icon } from '../icons/Icon';

export interface ProfileFriendsListFetchResult {
  friends: FriendInfo[];
  hidden: boolean;
  count: number;
  cursor: string | null;
}

export interface ProfileFriendsListProps {
  /** Static friends array (used in static mode when fetchFriends is absent) */
  friends?: FriendInfo[];
  hidden?: boolean;
  loading?: boolean;
  /** Fetcher for paginated / searchable mode; when provided, static props are ignored */
  fetchFriends?: (params: {
    limit?: number;
    cursor?: string;
    q?: string;
  }) => Promise<ProfileFriendsListFetchResult | null>;
  /** Callback when count/hidden are first resolved so the parent can update tab labels */
  onMetaLoaded?: (meta: { count: number; hidden: boolean }) => void;
  selfIdentityId?: string;
  onSendFriendRequest?: (identityId: string) => Promise<boolean>;
  onGetFriendshipStatus?: (identityId: string) => Promise<FriendshipStatusResult>;
}

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;

export function ProfileFriendsList({
  friends: staticFriends,
  hidden: staticHidden,
  loading: staticLoading,
  fetchFriends,
  onMetaLoaded,
  selfIdentityId,
  onSendFriendRequest,
  onGetFriendshipStatus,
}: ProfileFriendsListProps) {
  if (fetchFriends) {
    return (
      <FetchedFriendsList
        fetchFriends={fetchFriends}
        onMetaLoaded={onMetaLoaded}
        selfIdentityId={selfIdentityId}
        onSendFriendRequest={onSendFriendRequest}
        onGetFriendshipStatus={onGetFriendshipStatus}
      />
    );
  }

  return (
    <StaticFriendsList
      friends={staticFriends ?? []}
      hidden={staticHidden ?? false}
      loading={staticLoading ?? false}
      selfIdentityId={selfIdentityId}
      onSendFriendRequest={onSendFriendRequest}
      onGetFriendshipStatus={onGetFriendshipStatus}
    />
  );
}

// ---------------------------------------------------------------------------
// Static mode (profile editor preview)
// ---------------------------------------------------------------------------

function StaticFriendsList({
  friends,
  hidden,
  loading,
  selfIdentityId,
  onSendFriendRequest,
  onGetFriendshipStatus,
}: {
  friends: FriendInfo[];
  hidden: boolean;
  loading: boolean;
  selfIdentityId?: string;
  onSendFriendRequest?: (identityId: string) => Promise<boolean>;
  onGetFriendshipStatus?: (identityId: string) => Promise<FriendshipStatusResult>;
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => {
      const name = f.identity.displayName.toLowerCase();
      const user = f.identity.username.toLowerCase();
      return name.includes(q) || user.includes(q);
    });
  }, [friends, searchQuery]);

  if (loading) {
    return (
      <div className="profile-friends-list profile-friends-list--loading">
        <div className="spinner spinner-sm" />
        <p className="profile-view-tab-placeholder">
          {t('identity.profileView.friendsLoading')}
        </p>
      </div>
    );
  }

  if (hidden) {
    return (
      <p className="profile-view-tab-placeholder">
        {t('identity.profileView.friendsHidden')}
      </p>
    );
  }

  if (friends.length === 0) {
    return (
      <p className="profile-view-tab-placeholder">
        {t('identity.profileView.friendsEmpty')}
      </p>
    );
  }

  return (
    <div className="profile-friends-list">
      <div className="profile-friends-list-search">
        <Input
          inputSize="sm"
          leftIcon={<Icon name="search" />}
          placeholder={t('identity.profileView.friendsSearch')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="profile-view-tab-placeholder">
          {t('identity.profileView.friendsNoResults')}
        </p>
      ) : (
        <div className="profile-friends-list-grid">
          {filtered.map((friend) => (
            <IdentityCard
              key={friend.identity.id}
              identity={friend.identity}
              showFriendAction={!!onSendFriendRequest}
              onSendFriendRequest={onSendFriendRequest}
              onGetFriendshipStatus={onGetFriendshipStatus}
              selfIdentityId={selfIdentityId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fetched mode (profile view -- paginated + server-side search)
// ---------------------------------------------------------------------------

function FetchedFriendsList({
  fetchFriends,
  onMetaLoaded,
  selfIdentityId,
  onSendFriendRequest,
  onGetFriendshipStatus,
}: {
  fetchFriends: (params: {
    limit?: number;
    cursor?: string;
    q?: string;
  }) => Promise<ProfileFriendsListFetchResult | null>;
  onMetaLoaded?: (meta: { count: number; hidden: boolean }) => void;
  selfIdentityId?: string;
  onSendFriendRequest?: (identityId: string) => Promise<boolean>;
  onGetFriendshipStatus?: (identityId: string) => Promise<FriendshipStatusResult>;
}) {
  const { t } = useTranslation();

  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cursorRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fetchInFlightRef = useRef(false);
  const fetchIdRef = useRef(0);
  const onMetaLoadedRef = useRef(onMetaLoaded);
  onMetaLoadedRef.current = onMetaLoaded;

  const fetchPage = useCallback(
    async (params: { cursor?: string; q?: string; append?: boolean }) => {
      const isAppend = params.append ?? false;
      const capturedFetchId = fetchIdRef.current;

      if (!isAppend) setLoading(true);
      else setLoadingMore(true);
      fetchInFlightRef.current = true;

      try {
        const result = await fetchFriends({
          limit: PAGE_SIZE,
          cursor: params.cursor,
          q: params.q || undefined,
        });

        if (capturedFetchId !== fetchIdRef.current || !result) return;

        setError(null);

        if (isAppend) {
          setFriends((prev) => {
            const existingIds = new Set(prev.map((f) => f.identity.id));
            const deduped = result.friends.filter((f) => !existingIds.has(f.identity.id));
            return [...prev, ...deduped];
          });
        } else {
          setFriends(result.friends);
          setHidden(result.hidden);
          onMetaLoadedRef.current?.({ count: result.count, hidden: result.hidden });
        }

        cursorRef.current = result.cursor;
      } catch {
        if (capturedFetchId === fetchIdRef.current) {
          setError(t('identity.profileView.error'));
        }
      } finally {
        fetchInFlightRef.current = false;
        if (!isAppend) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [fetchFriends, t],
  );

  useEffect(() => {
    let cancelled = false;
    fetchIdRef.current += 1;
    const capturedFetchId = fetchIdRef.current;

    setSearchQuery('');
    cursorRef.current = null;
    setError(null);

    const run = async () => {
      setLoading(true);
      try {
        const result = await fetchFriends({ limit: PAGE_SIZE });
        if (cancelled || capturedFetchId !== fetchIdRef.current || !result) return;

        setFriends(result.friends);
        setHidden(result.hidden);
        cursorRef.current = result.cursor;
        onMetaLoadedRef.current?.({ count: result.count, hidden: result.hidden });
      } catch {
        if (!cancelled && capturedFetchId === fetchIdRef.current) {
          setError(t('identity.profileView.error'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [fetchFriends, t]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        const q = value.trim();
        cursorRef.current = null;
        fetchPage({ q: q.length >= 2 ? q : undefined });
      }, SEARCH_DEBOUNCE_MS);
    },
    [fetchPage],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const loadMore = useCallback(() => {
    if (!cursorRef.current || loadingMore || loading || fetchInFlightRef.current) return;
    const q = searchQuery.trim();
    fetchPage({
      cursor: cursorRef.current,
      q: q.length >= 2 ? q : undefined,
      append: true,
    });
  }, [fetchPage, loadingMore, loading, searchQuery]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root: container ?? null, rootMargin: '120px', threshold: 0 },
    );

    io.observe(sentinel);
    return () => io.disconnect();
  }, [loadMore, friends.length]);

  if (loading) {
    return (
      <div className="profile-friends-list profile-friends-list--loading">
        <div className="spinner spinner-sm" />
        <p className="profile-view-tab-placeholder">
          {t('identity.profileView.friendsLoading')}
        </p>
      </div>
    );
  }

  if (error && friends.length === 0) {
    return (
      <p className="profile-view-tab-placeholder">
        {error}
      </p>
    );
  }

  if (hidden) {
    return (
      <p className="profile-view-tab-placeholder">
        {t('identity.profileView.friendsHidden')}
      </p>
    );
  }

  const isEmpty = friends.length === 0 && !searchQuery.trim();
  if (isEmpty) {
    return (
      <p className="profile-view-tab-placeholder">
        {t('identity.profileView.friendsEmpty')}
      </p>
    );
  }

  return (
    <div className="profile-friends-list" ref={scrollContainerRef}>
      <div className="profile-friends-list-search">
        <Input
          inputSize="sm"
          leftIcon={<Icon name="search" />}
          placeholder={t('identity.profileView.friendsSearch')}
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      {error && (
        <p className="profile-view-tab-placeholder">
          {error}
        </p>
      )}

      {friends.length === 0 ? (
        <p className="profile-view-tab-placeholder">
          {t('identity.profileView.friendsNoResults')}
        </p>
      ) : (
        <div className="profile-friends-list-grid">
          {friends.map((friend) => (
            <IdentityCard
              key={friend.identity.id}
              identity={friend.identity}
              showFriendAction={!!onSendFriendRequest}
              onSendFriendRequest={onSendFriendRequest}
              onGetFriendshipStatus={onGetFriendshipStatus}
              selfIdentityId={selfIdentityId}
            />
          ))}
        </div>
      )}

      {cursorRef.current && (
        <div
          ref={sentinelRef}
          className="profile-friends-list-sentinel"
          aria-hidden="true"
        >
          {loadingMore && <div className="spinner spinner-sm" />}
        </div>
      )}
    </div>
  );
}

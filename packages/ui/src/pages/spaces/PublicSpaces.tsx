/**
 * Public Spaces directory.
 *
 * Browsable list of discoverable (public/listed) Spaces. Discovery and joining
 * require an active Alias (identity) session, so guests see a sign-in prompt.
 * Join opens an interstitial (info, rules placeholder, Cipher detect) before
 * calling the join API; Browse navigates without joining for non-E2EE Spaces.
 */

import { createApiClient, type PublicSpace } from '@adieuu/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { useAppConfig } from '../../config';
import { useAuth } from '../../hooks/useAuth';
import { useCipherStore } from '../../hooks/useCipherStore';
import { useIdentity } from '../../hooks/useIdentity';
import { useSpaces } from '../../hooks/useSpaces';
import { getSpaceCipherLink } from '../../services/spaceCipherService';
import { JoinSpaceInterstitial } from './JoinSpaceInterstitial';
import { canBrowseSpace } from './joinSpaceGate';
import {
  resolveSpaceDisplayDescription,
  resolveSpaceDisplayName,
} from './spaceMetadataCipher';
import '../../styles/_spaces.scss';

const SEARCH_DEBOUNCE_MS = 400;
const PAGE_SIZE = 30;

export function PublicSpaces() {
  const { t } = useTranslation();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const { session } = useAuth();
  const { status: identityStatus } = useIdentity();
  const isLoggedIn = identityStatus === 'logged_in';
  const isPlatformAdmin = session?.isPlatformAdmin === true;
  const { spaces: joinedSpaces } = useSpaces();
  const { getCipherKey } = useCipherStore();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const joinedSpaceIds = useMemo(
    () => new Set(joinedSpaces.map((s) => s.id)),
    [joinedSpaces],
  );

  const [spaces, setSpaces] = useState<PublicSpace[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [joinTarget, setJoinTarget] = useState<PublicSpace | null>(null);
  const [canCreateSpace, setCanCreateSpace] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeq = useRef(0);

  const handleSearchInput = useCallback((value: string) => {
    setSearch(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const fetchSpaces = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setError(false);
    try {
      const res = await api.spaces.discover({
        limit: PAGE_SIZE,
        ...(debouncedSearch ? { q: debouncedSearch } : {}),
      });
      if (seq !== fetchSeq.current) return;
      if (res.success && res.data) {
        setSpaces(res.data.spaces);
        setCursor(res.data.cursor);
      } else {
        setError(true);
      }
    } catch {
      if (seq === fetchSeq.current) setError(true);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [api, debouncedSearch]);

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      setCanCreateSpace(false);
      return;
    }
    void fetchSpaces();
  }, [isLoggedIn, fetchSpaces]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (isPlatformAdmin) {
      setCanCreateSpace(true);
      return;
    }
    let cancelled = false;
    void api.spaces.getCreationEnabled().then((res) => {
      if (cancelled) return;
      setCanCreateSpace(res.success && res.data?.enabled === true);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, isPlatformAdmin, api]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !cursor) return;
    const seq = fetchSeq.current;
    setLoadingMore(true);
    try {
      const res = await api.spaces.discover({
        limit: PAGE_SIZE,
        cursor,
        ...(debouncedSearch ? { q: debouncedSearch } : {}),
      });
      if (seq !== fetchSeq.current) return;
      if (res.success && res.data) {
        const { spaces: nextSpaces, cursor: nextCursor } = res.data;
        setSpaces((prev) => [...prev, ...nextSpaces]);
        setCursor(nextCursor);
      } else {
        toast.error(t('spaces.loadMoreError'));
      }
    } catch {
      if (seq === fetchSeq.current) toast.error(t('spaces.loadMoreError'));
    } finally {
      setLoadingMore(false);
    }
  }, [api, cursor, debouncedSearch, loadingMore, toast, t]);

  const renderHeader = () => (
    <div className="page-header">
      <h1 className="page-title">{t('spaces.title')}</h1>
      <p className="page-subtitle">{t('spaces.subtitle')}</p>
    </div>
  );

  if (!isLoggedIn) {
    return (
      <div className="page-content">
        <div className="container">
          {renderHeader()}
          <Card variant="elevated" className="spaces-state">
            <p className="spaces-state-heading">{t('spaces.signInHeading')}</p>
            <p className="spaces-state-body">{t('spaces.signInBody')}</p>
            <Link to="/identity/profile" className="btn btn-primary btn-md">
              {t('spaces.signInCta')}
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="container">
        {renderHeader()}

        <div className="spaces-directory-controls">
          <input
            type="search"
            className="spaces-search-input"
            placeholder={t('spaces.searchPlaceholder')}
            aria-label={t('spaces.searchPlaceholder')}
            value={search}
            onChange={(e) => handleSearchInput(e.target.value)}
          />
          {canCreateSpace ? (
            <Link to="/spaces/new" className="btn btn-primary btn-md spaces-create-cta">
              {t('spaces.create.cta')}
            </Link>
          ) : null}
        </div>

        {loading ? (
          <div className="spaces-loading">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <Card variant="elevated" className="spaces-state">
            <p className="spaces-state-heading">{t('spaces.error.heading')}</p>
            <p className="spaces-state-body">{t('spaces.error.body')}</p>
            <Button variant="secondary" onClick={() => void fetchSpaces()}>
              {t('spaces.error.retry')}
            </Button>
          </Card>
        ) : spaces.length === 0 ? (
          <Card variant="elevated" className="spaces-state">
            <p className="spaces-state-heading">{t('spaces.empty.heading')}</p>
            <p className="spaces-state-body">{t('spaces.empty.body')}</p>
          </Card>
        ) : (
          <>
            <div className="spaces-grid">
              {spaces.map((space) => {
                const localCipherId = getSpaceCipherLink(space.id);
                const cipher = localCipherId ? getCipherKey(localCipherId) : null;
                const displayName = resolveSpaceDisplayName(space, cipher, {
                  encryptedSpace: t('spaces.encryptedSpacePlaceholder'),
                });
                const description = resolveSpaceDisplayDescription(space, cipher);
                const spacePath = `/s/${space.slug}`;
                const isBanned = space.membershipStatus === 'banned';
                const isJoined =
                  !isBanned &&
                  (space.membershipStatus === 'active' || joinedSpaceIds.has(space.id));
                const canBrowse = !isBanned && (isJoined || canBrowseSpace(space));
                return (
                  <Card key={space.id} variant="elevated" className="spaces-card">
                    <div className="spaces-card-header">
                      <div>
                        {canBrowse ? (
                          <>
                            <Link to={spacePath} className="spaces-card-name">
                              {displayName}
                            </Link>
                            <Link to={spacePath} className="spaces-card-slug">
                              /s/{space.slug}
                            </Link>
                          </>
                        ) : (
                          <>
                            <div className="spaces-card-name">{displayName}</div>
                            <div className="spaces-card-slug">/s/{space.slug}</div>
                          </>
                        )}
                      </div>
                      <div className="spaces-card-badges">
                        <span className="spaces-badge">
                          {t(`spaces.visibility.${space.visibility}`)}
                        </span>
                        {space.e2ee && (
                          <span className="spaces-badge spaces-badge--encrypted">
                            {t('spaces.encrypted')}
                          </span>
                        )}
                        {space.cipherRequired && (
                          <span className="spaces-badge">
                            {t('spaces.joinModal.cipherRequiredBadge')}
                          </span>
                        )}
                        {isBanned && (
                          <span className="spaces-badge spaces-badge--banned">
                            {t('spaces.banned', 'Banned')}
                          </span>
                        )}
                        {isJoined && (
                          <span className="spaces-badge spaces-badge--joined">
                            {t('spaces.joined')}
                          </span>
                        )}
                      </div>
                    </div>

                    {description && (
                      <p className="spaces-card-description">{description}</p>
                    )}

                    <div className="spaces-card-footer">
                      <span className="spaces-card-members">
                        {t('spaces.memberCount', { count: space.memberCount })}
                      </span>
                      <div className="spaces-card-actions">
                        {isBanned ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled
                            aria-label={t('spaces.bannedCannotJoin', 'You are banned from this Space')}
                          >
                            {t('spaces.banned', 'Banned')}
                          </Button>
                        ) : isJoined ? (
                          <Link
                            to={spacePath}
                            className="btn btn-primary btn-sm"
                            aria-label={`${t('spaces.open')} ${displayName}`}
                          >
                            {t('spaces.open')}
                          </Link>
                        ) : (
                          <>
                            {canBrowseSpace(space) && (
                              <Link
                                to={spacePath}
                                className="btn btn-secondary btn-sm"
                                aria-label={`${t('spaces.joinModal.browse')} ${displayName}`}
                              >
                                {t('spaces.joinModal.browse')}
                              </Link>
                            )}
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setJoinTarget(space)}
                              aria-label={`${t('spaces.join')} ${displayName}`}
                            >
                              {t('spaces.join')}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {cursor && (
              <div className="spaces-load-more">
                <Button
                  variant="secondary"
                  onClick={() => void handleLoadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? <Spinner size="sm" /> : t('spaces.loadMore')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <JoinSpaceInterstitial
        space={joinTarget}
        open={!!joinTarget}
        onOpenChange={(open) => {
          if (!open) setJoinTarget(null);
        }}
      />
    </div>
  );
}

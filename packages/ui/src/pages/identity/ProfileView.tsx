/**
 * Public identity profile view.
 *
 * Read-only page for viewing any identity's profile (including your own).
 * Fetches the privacy-filtered profile from GET /api/identity/:id/profile.
 * If the viewer is looking at their own profile, shows an "Edit profile"
 * link to the editor page.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import {
  createApiClient,
  type PublicIdentity,
  type PublicAchievement,
  type PublicAchievementDefinition,
  type AchievementCategory,
  type FriendshipStatus,
} from '@adieuu/shared';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';
import type { AppIconName } from '../../icons/appIcons';
import { ReportModal } from '../../components/ReportModal';
import { BlockActionButton } from '../../components/BlockActionButton';
import { useIdentity } from '../../hooks/useIdentity';
import { useFriends } from '../../hooks/useFriends';
import { useBlockContext } from '../../hooks/useBlockContext';
import { useClaimAchievement } from '../../hooks/useClaimAchievement';
import { useAppConfig } from '../../config';

type LoadingState = 'loading' | 'loaded' | 'not_found' | 'error';

export function IdentityProfileView() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { identity: selfIdentity } = useIdentity();
  const { apiBaseUrl } = useAppConfig();

  const {
    sendRequest,
    removeFriend,
    getFriendshipStatus: getFriendStatus,
  } = useFriends();
  const { isBlocked: checkBlocked } = useBlockContext();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [profile, setProfile] = useState<PublicIdentity | null>(null);
  const [loadState, setLoadState] = useState<LoadingState>('loading');
  const [friendStatus, setFriendStatus] = useState<FriendshipStatus>('none');
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [achievements, setAchievements] = useState<PublicAchievement[]>([]);
  const [definitions, setDefinitions] = useState<PublicAchievementDefinition[]>([]);
  const [achievementsLoaded, setAchievementsLoaded] = useState(false);
  const [myAchievementIds, setMyAchievementIds] = useState<Set<string>>(new Set());

  type StatusFilter = 'all' | 'earned' | 'unearned';
  const [categoryFilter, setCategoryFilter] = useState<'all' | AchievementCategory>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const isSelf = selfIdentity?.id === id;
  const isIdentityLoggedIn = selfIdentity != null;

  useEffect(() => {
    if (!id) {
      setLoadState('not_found');
      return;
    }

    let cancelled = false;

    async function fetchProfile() {
      setLoadState('loading');

      try {
        const res = await api.identity.getProfile(id!);

        if (cancelled) return;

        if (res.success && res.data) {
          setProfile(res.data);
          setLoadState('loaded');
        } else {
          setLoadState('not_found');
        }
      } catch {
        if (!cancelled) setLoadState('error');
      }
    }

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [id, api]);

  const claimAchievement = useClaimAchievement();

  useEffect(() => {
    if (!id || !selfIdentity || isSelf || loadState !== 'loaded') return;
    try {
      const key = `ach_profile_views_${selfIdentity.id}`;
      const count = (parseInt(localStorage.getItem(key) ?? '0', 10) || 0) + 1;
      localStorage.setItem(key, String(count));
      if (count >= 25) claimAchievement('profile_views_25');
    } catch { /* localStorage unavailable */ }
  }, [id, selfIdentity, isSelf, loadState, claimAchievement]);

  useEffect(() => {
    if (!id || isSelf || !isIdentityLoggedIn) return;

    let cancelled = false;
    getFriendStatus(id).then((status) => {
      if (!cancelled) setFriendStatus(status);
    });
    return () => { cancelled = true; };
  }, [id, isSelf, isIdentityLoggedIn, getFriendStatus]);

  useEffect(() => {
    if (!id || loadState !== 'loaded') return;

    let cancelled = false;

    const fetches: Promise<void>[] = [
      api.achievements.getForIdentity(id).then((res) => {
        if (!cancelled && res.success && res.data) {
          setAchievements(res.data.achievements);
        }
      }),
      api.achievements.getDefinitions().then((res) => {
        if (!cancelled && res.success && res.data) {
          setDefinitions(res.data.definitions);
        }
      }),
    ];

    if (!isSelf && isIdentityLoggedIn) {
      fetches.push(
        api.achievements.getMine().then((res) => {
          if (!cancelled && res.success && res.data) {
            setMyAchievementIds(new Set(res.data.achievements.map((a) => a.achievementId)));
          }
        }),
      );
    }

    Promise.all(fetches).then(() => {
      if (!cancelled) setAchievementsLoaded(true);
    });

    return () => { cancelled = true; };
  }, [id, loadState, api, isSelf, isIdentityLoggedIn]);

  const handleAddFriend = useCallback(async () => {
    if (!id || friendActionLoading) return;
    setFriendActionLoading(true);
    const ok = await sendRequest(id);
    if (ok) setFriendStatus('pending_outgoing');
    setFriendActionLoading(false);
  }, [id, sendRequest, friendActionLoading]);

  const handleRemoveFriend = useCallback(async () => {
    if (!id || friendActionLoading) return;
    setFriendActionLoading(true);
    const ok = await removeFriend(id);
    if (ok) setFriendStatus('none');
    setFriendActionLoading(false);
  }, [id, removeFriend, friendActionLoading]);

  const earnedIds = useMemo(
    () => new Set(achievements.map((a) => a.achievementId)),
    [achievements],
  );

  const filteredItems = useMemo(() => {
    const earnedMap = new Map(achievements.map((a) => [a.achievementId, a]));

    type DisplayItem = {
      key: string;
      definition: PublicAchievementDefinition;
      earned: boolean;
      achievement?: PublicAchievement;
    };

    const items: DisplayItem[] = definitions.map((def) => {
      const ach = earnedMap.get(def.id);
      return {
        key: def.id,
        definition: def,
        earned: !!ach,
        achievement: ach,
      };
    });

    return items.filter((item) => {
      if (categoryFilter !== 'all' && item.definition.category !== categoryFilter) return false;
      if (statusFilter === 'earned' && !item.earned) return false;
      if (statusFilter === 'unearned' && item.earned) return false;
      return true;
    });
  }, [definitions, achievements, categoryFilter, statusFilter]);

  const categoryCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: 'all', label: t('achievements.filterAll') },
          { value: 'social', label: t('achievements.category.social') },
          { value: 'messaging', label: t('achievements.category.messaging') },
          { value: 'security', label: t('achievements.category.security') },
          { value: 'profile', label: t('achievements.category.profile') },
          { value: 'misc', label: t('achievements.category.misc') },
        ],
      }),
    [t],
  );

  const statusCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: 'all', label: t('achievements.filterAll') },
          { value: 'earned', label: t('achievements.filterEarned') },
          { value: 'unearned', label: t('achievements.filterUnearned') },
        ],
      }),
    [t],
  );

  const categoryLabel = categoryCollection.items.find((i) => i.value === categoryFilter)?.label ?? '';
  const statusLabel = statusCollection.items.find((i) => i.value === statusFilter)?.label ?? '';

  if (loadState === 'loading') {
    return (
      <div className="page-content">
        <div className="container">
          <div className="profile-view-loading">
            <div className="spinner spinner-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (loadState === 'not_found') {
    return (
      <div className="page-content">
        <div className="container">
          <Card variant="elevated">
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {t('identity.profileView.notFound')}
            </p>
          </Card>
        </div>
      </div>
    );
  }

  if (loadState === 'error' || !profile) {
    return (
      <div className="page-content">
        <div className="container">
          <Card variant="elevated">
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {t('identity.profileView.error')}
            </p>
          </Card>
        </div>
      </div>
    );
  }

  const initials = profile.displayName
    .split(' ')
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const colors = profile.profileColors;
  const cardBg = colors?.cardBackground;
  const accent = colors?.accent;

  const viewStyle: React.CSSProperties = {
    ...(accent ? { '--profile-accent': accent } as React.CSSProperties : {}),
    ...(cardBg ? { '--profile-card-bg': cardBg } as React.CSSProperties : {}),
  };

  return (
    <div
      className="page-content"
      style={colors?.background
        ? { backgroundColor: colors.background }
        : undefined}
    >
      <div className="container">
        <div className="profile-view" style={viewStyle}>
          {/* Unified card: banner + avatar + info */}
          <div
            className="profile-view-card slide-up"
            style={cardBg ? { backgroundColor: cardBg } : undefined}
          >
            <div
              className="profile-view-banner"
              style={{
                backgroundImage: profile.bannerUrl
                  ? `url(${profile.bannerUrl})`
                  : undefined,
                backgroundColor:
                  profile.profileColors?.accent || 'var(--color-bg-tertiary)',
              }}
            />

            <div className="profile-view-body">
              <div className="profile-view-avatar-wrapper">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    className="profile-view-avatar"
                    style={cardBg ? { borderColor: cardBg } : undefined}
                  />
                ) : (
                  <div
                    className="profile-view-avatar profile-view-avatar--placeholder"
                    style={cardBg ? { borderColor: cardBg } : undefined}
                  >
                    <span>{initials}</span>
                  </div>
                )}
              </div>

              <div className="profile-view-name-row">
                <div>
                  <h1
                    className="profile-view-display-name"
                    style={{ color: profile.profileColors?.accent || undefined }}
                  >
                    {profile.displayName}
                  </h1>
                  <p className="profile-view-username">@{profile.username}</p>
                </div>
                {isSelf && (
                  <Link to="/identity/profile">
                    <Button variant="secondary" size="sm">
                      {t('identity.profileView.editProfile')}
                    </Button>
                  </Link>
                )}
                {!isSelf && isIdentityLoggedIn && id && (
                  <div className="profile-view-friend-actions">
                    {!checkBlocked(id) && friendStatus === 'none' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleAddFriend}
                        disabled={friendActionLoading}
                      >
                        <Icon name="plus" />
                        {t('friends.addFriend')}
                      </Button>
                    )}
                    {!checkBlocked(id) && (friendStatus === 'pending_outgoing' || friendStatus === 'pending_incoming') && (
                      <Button variant="ghost" size="sm" disabled>
                        {t('friends.pending')}
                      </Button>
                    )}
                    {!checkBlocked(id) && friendStatus === 'friends' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveFriend}
                        disabled={friendActionLoading}
                      >
                        <Icon name="x" />
                        {t('friends.removeFriend')}
                      </Button>
                    )}
                    <BlockActionButton identityId={id} />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReportOpen(true)}
                    >
                      <Icon name="warning" />
                      {t('report.reportProfile')}
                    </Button>
                  </div>
                )}
              </div>

              {profile.bio && (
                <p className="profile-view-bio">{profile.bio}</p>
              )}

              {profile.lastActiveAt && (
                <p className="profile-view-meta">
                  {t('identity.profileView.lastActive', {
                    date: new Date(profile.lastActiveAt).toLocaleDateString(),
                  })}
                </p>
              )}

              <p className="profile-view-meta">
                {t('identity.profileView.joined', {
                  date: new Date(profile.createdAt).toLocaleDateString(),
                })}
              </p>
            </div>
          </div>

          {/* Achievements */}
          <div className="profile-view-achievements">
            <div className="achievement-header">
              <h2 className="profile-view-section-title">
                <Icon name="trophy" size="sm" />
                {t('identity.profileView.tabAchievements')}
              </h2>

              {achievementsLoaded && definitions.length > 0 && (
                <div className="achievement-header__filters">
                  <Select.Root
                    collection={categoryCollection}
                    value={[categoryFilter]}
                    onValueChange={(d) => {
                      const next = d.value[0] as 'all' | AchievementCategory | undefined;
                      if (next) setCategoryFilter(next);
                    }}
                    positioning={{ sameWidth: true }}
                  >
                    <Select.Control className="achievement-select-control">
                      <Select.Trigger className="achievement-select-trigger">
                        <Select.ValueText>{categoryLabel}</Select.ValueText>
                        <Select.Indicator className="achievement-select-indicator">
                          <Icon name="chevronDown" size="xs" />
                        </Select.Indicator>
                      </Select.Trigger>
                    </Select.Control>
                    <Portal>
                      <Select.Positioner>
                        <Select.Content className="achievement-select-content">
                          {categoryCollection.items.map((item) => (
                            <Select.Item key={item.value} item={item} className="achievement-select-item">
                              <Select.ItemText>{item.label}</Select.ItemText>
                              <Select.ItemIndicator className="achievement-select-item-indicator">
                                <Icon name="check" size="xs" />
                              </Select.ItemIndicator>
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Positioner>
                    </Portal>
                  </Select.Root>

                  <Select.Root
                    collection={statusCollection}
                    value={[statusFilter]}
                    onValueChange={(d) => {
                      const next = d.value[0] as StatusFilter | undefined;
                      if (next) setStatusFilter(next);
                    }}
                    positioning={{ sameWidth: true }}
                  >
                    <Select.Control className="achievement-select-control">
                      <Select.Trigger className="achievement-select-trigger">
                        <Select.ValueText>{statusLabel}</Select.ValueText>
                        <Select.Indicator className="achievement-select-indicator">
                          <Icon name="chevronDown" size="xs" />
                        </Select.Indicator>
                      </Select.Trigger>
                    </Select.Control>
                    <Portal>
                      <Select.Positioner>
                        <Select.Content className="achievement-select-content">
                          {statusCollection.items.map((item) => (
                            <Select.Item key={item.value} item={item} className="achievement-select-item">
                              <Select.ItemText>{item.label}</Select.ItemText>
                              <Select.ItemIndicator className="achievement-select-item-indicator">
                                <Icon name="check" size="xs" />
                              </Select.ItemIndicator>
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Positioner>
                    </Portal>
                  </Select.Root>
                </div>
              )}
            </div>

            {!achievementsLoaded ? (
              <div className="profile-view-loading">
                <div className="spinner" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="profile-view-achievements-empty">
                <p style={{ color: 'var(--color-text-secondary)' }}>
                  {categoryFilter !== 'all' || statusFilter !== 'all'
                    ? t('achievements.noResults')
                    : t('achievements.noAchievements')}
                </p>
              </div>
            ) : (
              <div className="profile-view-achievements-grid">
                {filteredItems.map((item) => {
                  const viewerLacksThis = !isSelf && isIdentityLoggedIn
                    && !myAchievementIds.has(item.definition.id);

                  return (
                    <div
                      key={item.key}
                      className={`achievement-card${!item.earned ? ' achievement-card--locked' : ''}`}
                    >
                      <div className="achievement-card-icon">
                        <Icon name={item.definition.icon as AppIconName} size="lg" />
                      </div>
                      <div className="achievement-card-info">
                        <span className="achievement-card-name">
                          {t(item.definition.name)}
                        </span>
                        <span className="achievement-card-desc">
                          {t(item.definition.description)}
                        </span>
                        {isSelf && item.earned && item.achievement?.awardedAt && (
                          <span className="achievement-card-date">
                            {new Date(item.achievement.awardedAt).toLocaleDateString()}
                          </span>
                        )}
                        {!item.earned && (
                          <span className="achievement-card-not-earned">
                            {t('achievements.notYetEarned')}
                          </span>
                        )}
                        {item.earned && viewerLacksThis && (
                          <span className="achievement-card-not-earned">
                            {t('achievements.youDontHaveThis')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {!isSelf && isIdentityLoggedIn && id && (
        <ReportModal
          open={reportOpen}
          onOpenChange={setReportOpen}
          mode="profile"
          targetIdentityId={id}
        />
      )}
    </div>
  );
}

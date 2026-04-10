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
import {
  createApiClient,
  type PublicIdentity,
  type PublicAchievement,
  type FriendshipStatus,
} from '@adieuu/shared';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';
import type { AppIconName } from '../../icons/appIcons';
import { Tabs, TabList, TabTrigger, TabContent } from '../../components/Tabs';
import { ReportModal } from '../../components/ReportModal';
import { useIdentity } from '../../hooks/useIdentity';
import { useFriends } from '../../hooks/useFriends';
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

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [profile, setProfile] = useState<PublicIdentity | null>(null);
  const [loadState, setLoadState] = useState<LoadingState>('loading');
  const [friendStatus, setFriendStatus] = useState<FriendshipStatus>('none');
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [achievements, setAchievements] = useState<PublicAchievement[]>([]);
  const [achievementsLoaded, setAchievementsLoaded] = useState(false);

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
    api.achievements.getForIdentity(id).then((res) => {
      if (!cancelled && res.success && res.data) {
        setAchievements(res.data.achievements);
      }
      if (!cancelled) setAchievementsLoaded(true);
    });
    return () => { cancelled = true; };
  }, [id, loadState, api]);

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

  return (
    <div className="page-content">
      <div className="container">
        <div
          className="profile-view"
          style={profile.profileColors?.background
            ? { backgroundColor: profile.profileColors.background }
            : undefined}
        >
          {/* Banner + Avatar hero */}
          <div className="profile-view-hero">
            <div
              className="profile-view-banner"
              style={{
                backgroundImage: profile.bannerUrl
                  ? `url(${profile.bannerUrl})`
                  : undefined,
                backgroundColor:
                  profile.profileColors?.primary || 'var(--color-bg-tertiary)',
              }}
            />
            <div className="profile-view-avatar-wrapper">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  className="profile-view-avatar"
                />
              ) : (
                <div className="profile-view-avatar profile-view-avatar--placeholder">
                  <span>{initials}</span>
                </div>
              )}
            </div>
          </div>

          {/* Identity info */}
          <Card variant="elevated" className="profile-view-info slide-up">
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
              {!isSelf && isIdentityLoggedIn && (
                <div className="profile-view-friend-actions">
                  {friendStatus === 'none' && (
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
                  {(friendStatus === 'pending_outgoing' || friendStatus === 'pending_incoming') && (
                    <Button variant="ghost" size="sm" disabled>
                      {t('friends.pending')}
                    </Button>
                  )}
                  {friendStatus === 'friends' && (
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
          </Card>

          {/* Profile tabs */}
          <Tabs defaultTab="about" className="profile-view-tabs">
            <TabList>
              <TabTrigger value="about">{t('identity.profileView.tabAbout')}</TabTrigger>
              <TabTrigger value="achievements">
                <Icon name="trophy" />
                {t('identity.profileView.tabAchievements')}
              </TabTrigger>
            </TabList>

            <TabContent value="about" />

            <TabContent value="achievements">
              {!achievementsLoaded ? (
                <div className="profile-view-loading">
                  <div className="spinner" />
                </div>
              ) : achievements.length === 0 ? (
                <Card variant="elevated" className="profile-view-achievements-empty">
                  <p style={{ color: 'var(--color-text-secondary)' }}>
                    {t('achievements.noAchievements')}
                  </p>
                </Card>
              ) : (
                <div className="profile-view-achievements-grid">
                  {achievements.map((ach) => (
                    <Card key={ach.id} variant="elevated" className="achievement-card">
                      <div className="achievement-card-icon">
                        <Icon name={ach.definition.icon as AppIconName} size="lg" />
                      </div>
                      <div className="achievement-card-info">
                        <span className="achievement-card-name">
                          {t(ach.definition.name)}
                        </span>
                        <span className="achievement-card-desc">
                          {t(ach.definition.description)}
                        </span>
                        <span className="achievement-card-date">
                          {new Date(ach.awardedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabContent>
          </Tabs>
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

/**
 * Spaces sidebar tab content.
 *
 * Mirrors the Conversations tab: an actions row (Discover → public directory)
 * plus a list of the Spaces the current Alias is a member of, rendered like
 * conversation rows (a circular Space avatar + name). Selecting a Space opens
 * `/s/:slug`. Membership is fetched on mount via `client.spaces.listMine()`;
 * a richer provider-backed store lands with the full Space view phase.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createApiClient, type PublicSpace } from '@adieuu/shared';
import { SidebarItem, useSidebar } from '../../components/Sidebar';
import { Icon } from '../../icons/Icon';
import { useAppConfig } from '../../config';
import { useIdentity } from '../../hooks/useIdentity';
import { onSpacesChanged } from '../../services/spacesMembershipEvents';

export function SpacesSidebarSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closeMobile } = useSidebar();
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const isIdentityLoggedIn = identityStatus === 'logged_in';
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [spaces, setSpaces] = useState<PublicSpace[]>([]);
  const [loading, setLoading] = useState(true);

  // Guards against a stale (slower) fetch overwriting a newer one when a refresh
  // is triggered while an earlier load is still in flight.
  const loadSeq = useRef(0);

  const loadSpaces = useCallback(() => {
    if (!isIdentityLoggedIn) {
      loadSeq.current++;
      setSpaces([]);
      setLoading(false);
      return;
    }
    const seq = ++loadSeq.current;
    setLoading(true);
    api.spaces
      .listMine()
      .then((res) => {
        if (seq !== loadSeq.current) return;
        setSpaces(res.success && res.data ? res.data.spaces : []);
      })
      .catch(() => {
        if (seq === loadSeq.current) setSpaces([]);
      })
      .finally(() => {
        if (seq === loadSeq.current) setLoading(false);
      });
  }, [api, isIdentityLoggedIn]);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  // Refresh when a Space is created/joined elsewhere so it appears immediately.
  useEffect(() => onSpacesChanged(loadSpaces), [loadSpaces]);

  const handleDiscover = useCallback(() => {
    navigate('/spaces');
    closeMobile();
  }, [navigate, closeMobile]);

  const handleCreate = useCallback(() => {
    navigate('/spaces/new');
    closeMobile();
  }, [navigate, closeMobile]);

  const handleOpenSpace = useCallback(
    (slug: string) => {
      navigate(`/s/${slug}`);
      closeMobile();
    },
    [navigate, closeMobile],
  );

  return (
    <>
      <div className="sidebar-conversations-actions">
        <SidebarItem
          icon={<Icon name="globe" />}
          label={t('sidebar.discoverSpaces', 'Discover')}
          onClick={handleDiscover}
        />
        {isIdentityLoggedIn && (
          <SidebarItem
            icon={<Icon name="plus" />}
            label={t('sidebar.createSpace', 'Create Space')}
            onClick={handleCreate}
          />
        )}
      </div>

      {isIdentityLoggedIn && loading && spaces.length === 0 && (
        <div className="sidebar-conversations-loading">
          <span className="spinner spinner-sm" />
        </div>
      )}

      <div className="sidebar-conversations-list">
        {spaces.map((space) => (
          <button
            key={space.id}
            type="button"
            className="conversation-list-item"
            onClick={() => handleOpenSpace(space.slug)}
          >
            <div className="conversation-list-item-avatar">
              <span className="conversation-list-item-avatar-placeholder">
                {space.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="conversation-list-item-info">
              <span className="conversation-list-item-title">{space.name}</span>
              <span className="conversation-list-item-members">
                {t('spaces.memberCount', { count: space.memberCount })}
              </span>
            </div>
          </button>
        ))}

        {!loading && spaces.length === 0 && (
          <div className="sidebar-conversations-empty">
            {isIdentityLoggedIn
              ? t('sidebar.noSpaces', "You haven't joined any Spaces yet")
              : t('sidebar.signInForSpaces', 'Sign into an Alias to see Spaces')}
          </div>
        )}
      </div>
    </>
  );
}

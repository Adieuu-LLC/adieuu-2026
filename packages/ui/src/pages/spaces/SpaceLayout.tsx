/**
 * Nested layout for a single Space at `/s/:slug`.
 *
 * Resolves the slug, guards for an Alias session, and renders a Discord-like
 * secondary sidebar (channels) alongside an `<Outlet />` for the landing page
 * or channel views. On narrow viewports the channel rail becomes an off-canvas
 * drawer with a compact Select chrome. Manage routes hide the channel rail at
 * all widths so the manage/roles chrome has room on midsize viewports.
 *
 * Index route (`/s/:slug`) renders Space Home. Resume-to-last-channel happens
 * when opening a Space from the primary Spaces sidebar, not from Home.
 *
 * Sign-in gating is a separate component so guests never call `useSpaces`
 * (SpacesProvider is only guaranteed once an Alias session or the public shell
 * providers are mounted).
 */

import { useEffect, useState } from 'react';
import { Link, Outlet, useParams, useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useIdentity } from '../../hooks/useIdentity';
import { useSpaces } from '../../hooks/useSpaces';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { JoinSpaceInterstitial } from './JoinSpaceInterstitial';
import { SpaceJoinBanner } from './SpaceJoinBanner';
import { SpaceMobileChrome } from './SpaceMobileChrome';
import { SpaceSecondarySidebar } from './SpaceSecondarySidebar';
import { useAutoDetectSpaceChannelCiphers } from './useAutoDetectSpaceChannelCiphers';
import { useSpaceMobileNav } from './useSpaceMobileNav';
import '../../styles/_spaces.scss';
import '../../styles/_spaces-sidebar.scss';

function SpaceSignInPrompt() {
  const { t } = useTranslation();
  return (
    <div className="page-content">
      <div className="container">
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

function SpaceLayoutSession() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  // Call both matches unconditionally — `||` short-circuit would skip a hook.
  const manageExactMatch = useMatch('/s/:slug/manage');
  const manageNestedMatch = useMatch('/s/:slug/manage/*');
  const isManageRoute = !!manageExactMatch || !!manageNestedMatch;
  const {
    activeSpace,
    activeSpaceLoading,
    activeSpaceError,
    setActiveSpace,
    isActiveSpaceMember,
  } = useSpaces();
  const [joinOpen, setJoinOpen] = useState(false);
  const {
    isNarrow,
    isMobileNavOpen,
    closeMobileNav,
    toggleMobileNav,
  } = useSpaceMobileNav();

  // Unlock encrypted channel/category names on first enter (deduped cipher checks).
  useAutoDetectSpaceChannelCiphers();

  useEffect(() => {
    if (slug) {
      setActiveSpace(slug);
    }
    return () => {
      setActiveSpace(null);
    };
  }, [slug, setActiveSpace]);

  // Close the channel drawer when entering manage (sidebar is hidden there).
  useEffect(() => {
    if (isManageRoute) closeMobileNav();
  }, [isManageRoute, closeMobileNav]);

  if (activeSpaceLoading) {
    return (
      <div className="page-content">
        <div className="container">
          <div className="spaces-loading">
            <Spinner size="lg" />
          </div>
        </div>
      </div>
    );
  }

  if (activeSpaceError === 'error') {
    return (
      <div className="page-content">
        <div className="container">
          <Card variant="elevated" className="spaces-state">
            <p className="spaces-state-heading">{t('spaces.view.errorHeading')}</p>
            <p className="spaces-state-body">{t('spaces.view.errorBody')}</p>
            <Button variant="secondary" onClick={() => slug && setActiveSpace(slug)}>
              {t('spaces.view.retry')}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (activeSpaceError === 'not_found' || (!activeSpace && !activeSpaceLoading)) {
    return (
      <div className="page-content">
        <div className="container">
          <Card variant="elevated" className="spaces-state">
            <p className="spaces-state-heading">{t('spaces.view.notFoundHeading')}</p>
            <p className="spaces-state-body">{t('spaces.view.notFoundBody')}</p>
            <Link to="/spaces" className="btn btn-secondary btn-md">
              {t('spaces.view.back')}
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  // Manage already has its own secondary nav (and Roles a third list). Keep the
  // channel rail out of the way at every width so midsize viewports are usable.
  const hideChannelSidebar = isManageRoute;
  const showMobileChrome = isNarrow && !isManageRoute;

  return (
    <div className={`space-page${isNarrow ? ' space-page--narrow' : ''}${isManageRoute ? ' space-page--manage' : ''}`}>
      {!hideChannelSidebar && (
        <>
          {isNarrow && (
            <div
              className={`space-mobile-overlay${isMobileNavOpen ? ' space-mobile-overlay--visible' : ''}`}
              onClick={closeMobileNav}
              aria-hidden="true"
            />
          )}
          <SpaceSecondarySidebar
            mobileOpen={isNarrow && isMobileNavOpen}
            onNavigate={closeMobileNav}
            resizable={!isNarrow}
          />
        </>
      )}
      <div className="space-outlet">
        {showMobileChrome && (
          <SpaceMobileChrome
            isMobileNavOpen={isMobileNavOpen}
            onToggleNav={toggleMobileNav}
            onNavigate={closeMobileNav}
          />
        )}
        <Outlet />
        {!isActiveSpaceMember && (
          <SpaceJoinBanner onRequestJoin={() => setJoinOpen(true)} />
        )}
      </div>
      {joinOpen && (
        <JoinSpaceInterstitial
          space={activeSpace}
          open={joinOpen}
          onOpenChange={setJoinOpen}
        />
      )}
    </div>
  );
}

export function SpaceLayout() {
  const { status: identityStatus } = useIdentity();
  const isLoggedIn = identityStatus === 'logged_in';

  if (!isLoggedIn) {
    return <SpaceSignInPrompt />;
  }

  return <SpaceLayoutSession />;
}

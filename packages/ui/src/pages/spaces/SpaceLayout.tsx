/**
 * Nested layout for a single Space at `/s/:slug`.
 *
 * Resolves the slug, guards for an Alias session, and renders a Discord-like
 * secondary sidebar (channels) alongside an `<Outlet />` for the landing page
 * or channel views.
 *
 * When navigating to the index route (`/s/:slug` with no channel), the layout
 * auto-redirects to the last-viewed channel (persisted in localStorage) or the
 * first channel in the list.
 */

import { useEffect, useRef } from 'react';
import { Link, Outlet, useParams, useNavigate, useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useIdentity } from '../../hooks/useIdentity';
import { useSpaces } from '../../hooks/useSpaces';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { SpaceSecondarySidebar } from './SpaceSecondarySidebar';
import '../../styles/_spaces.scss';

function getLastChannel(spaceId: string): string | null {
  try {
    return localStorage.getItem(`adieuu:lastChannel:${spaceId}`);
  } catch {
    return null;
  }
}

export function SpaceLayout() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const isIndexRoute = !!useMatch('/s/:slug');
  const { status: identityStatus } = useIdentity();
  const isLoggedIn = identityStatus === 'logged_in';
  const {
    activeSpace,
    activeSpaceLoading,
    activeSpaceError,
    channels,
    setActiveSpace,
  } = useSpaces();

  useEffect(() => {
    if (isLoggedIn && slug) {
      setActiveSpace(slug);
    }
    return () => {
      setActiveSpace(null);
    };
  }, [isLoggedIn, slug, setActiveSpace]);

  const didRedirect = useRef(false);
  useEffect(() => {
    if (!isIndexRoute || !activeSpace || !slug || channels.length === 0 || didRedirect.current) return;
    const lastChannelId = getLastChannel(activeSpace.id);
    const target = lastChannelId && channels.some((ch) => ch.id === lastChannelId)
      ? lastChannelId
      : channels[0]?.id;
    if (target) {
      didRedirect.current = true;
      navigate(`/s/${slug}/c/${target}`, { replace: true });
    }
  }, [isIndexRoute, activeSpace, slug, channels, navigate]);

  useEffect(() => {
    didRedirect.current = false;
  }, [slug]);

  if (!isLoggedIn) {
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

  return (
    <div className="space-page">
      <SpaceSecondarySidebar />
      <div className="space-outlet">
        <Outlet />
      </div>
    </div>
  );
}

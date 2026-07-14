/**
 * Space view (placeholder).
 *
 * Landing page for a single Space at `/s/:slug`. The full experience
 * (channel sidebar, messaging, E2EE handling) lands in a later phase; for now
 * this resolves the slug, guards for an Alias session, and shows a summary with
 * a "coming soon" note so directory joins and invite acceptance have a target.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createApiClient, type PublicSpace } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { useIdentity } from '../../hooks/useIdentity';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import '../../styles/_spaces.scss';

/** Error codes that mean the Space is genuinely missing/inaccessible (not a transient failure). */
const NOT_FOUND_CODES = new Set(['NOT_FOUND', 'FORBIDDEN']);

export function SpaceView() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const isLoggedIn = identityStatus === 'logged_in';
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [space, setSpace] = useState<PublicSpace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isLoggedIn || !slug) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.spaces
      .getBySlug(slug)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setSpace(res.data);
        } else if (res.error && NOT_FOUND_CODES.has(res.error.code)) {
          // Genuine 404 / inaccessible: render the "not found" state.
          setSpace(null);
        } else {
          // Network/server failure: render a retryable error state.
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, isLoggedIn, slug, reloadKey]);

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

  if (loading) {
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

  if (error) {
    return (
      <div className="page-content">
        <div className="container">
          <Card variant="elevated" className="spaces-state">
            <p className="spaces-state-heading">{t('spaces.view.errorHeading')}</p>
            <p className="spaces-state-body">{t('spaces.view.errorBody')}</p>
            <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
              {t('spaces.view.retry')}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (!space) {
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
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{space.name}</h1>
          <p className="page-subtitle">/s/{space.slug}</p>
        </div>
        <Card variant="elevated" className="space-view-placeholder">
          {space.description && (
            <p className="spaces-card-description">{space.description}</p>
          )}
          <span className="spaces-card-members">
            {t('spaces.memberCount', { count: space.memberCount })}
          </span>
          <p className="spaces-state-body">{t('spaces.view.comingSoon')}</p>
        </Card>
      </div>
    </div>
  );
}

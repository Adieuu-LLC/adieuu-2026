/**
 * Sponsorship Directory page.
 *
 * Paginated grid of active sponsorship requests that any logged-in user may browse.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createApiClient, type SponsorshipDirectoryEntry } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { SponsorCheckoutModal } from './SponsorCheckoutModal';
import '../../styles/_sponsorship.scss';

export function SponsorshipDirectoryPage() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [entries, setEntries] = useState<SponsorshipDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sponsorTarget, setSponsorTarget] = useState<SponsorshipDirectoryEntry | null>(null);

  const fetchDirectory = useCallback(async (cursor?: string) => {
    const res = await api.sponsorship.getDirectory(cursor);
    if (res.success && res.data) {
      if (cursor) {
        setEntries((prev) => [...prev, ...(res.data?.entries ?? [])]);
      } else {
        setEntries(res.data.entries);
      }
      setHasMore(res.data.hasMore);
    }
  }, [api]);

  useEffect(() => {
    setLoading(true);
    fetchDirectory().finally(() => setLoading(false));
  }, [fetchDirectory]);

  async function handleLoadMore() {
    if (loadingMore || !entries.length) return;
    setLoadingMore(true);
    const lastEntry = entries[entries.length - 1];
    if (!lastEntry) {
      setLoadingMore(false);
      return;
    }
    await fetchDirectory(lastEntry.createdAt);
    setLoadingMore(false);
  }

  if (loading) {
    return (
      <div className="sponsorship-page">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="sponsorship-page">
      <h1 className="sponsorship-heading">{t('sponsorship.directory.heading')}</h1>
      <p className="sponsorship-description">{t('sponsorship.directory.description')}</p>

      {entries.length === 0 ? (
        <Card className="sponsorship-empty-card">
          <h3>{t('sponsorship.directory.emptyHeading')}</h3>
          <p>{t('sponsorship.directory.emptyBody')}</p>
        </Card>
      ) : (
        <>
          <div className="sponsorship-directory-grid">
            {entries.map((entry) => (
              <Card key={entry.id} className="sponsorship-directory-card">
                <div className="sponsorship-directory-card-header">
                  <span className="sponsorship-directory-card-name">
                    {entry.firstName} {entry.lastInitial}.
                  </span>
                  <span className="sponsorship-directory-card-jurisdiction">
                    {entry.jurisdiction}
                  </span>
                </div>
                {entry.message && (
                  <p className="sponsorship-directory-card-message">{entry.message}</p>
                )}
                <div className="sponsorship-directory-card-footer">
                  {entry.preferredProduct && (
                    <span className="sponsorship-directory-card-preference">
                      {t('sponsorship.directory.cardPreference', {
                        product: t(`account.subscription.tiers.${entry.preferredProduct}.name`),
                      })}
                    </span>
                  )}
                  <span className="sponsorship-directory-card-date">
                    {t('sponsorship.directory.cardDate', {
                      date: new Date(entry.createdAt).toLocaleDateString(),
                    })}
                  </span>
                </div>
                <Button
                  variant="primary"
                  className="sponsorship-directory-card-btn"
                  onClick={() => setSponsorTarget(entry)}
                >
                  {t('sponsorship.directory.sponsorButton')}
                </Button>
              </Card>
            ))}
          </div>

          {hasMore && (
            <Button
              variant="secondary"
              className="sponsorship-load-more"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? <Spinner size="sm" /> : t('sponsorship.directory.loadMore')}
            </Button>
          )}
        </>
      )}

      {sponsorTarget && (
        <SponsorCheckoutModal
          open={!!sponsorTarget}
          entry={sponsorTarget}
          onClose={() => setSponsorTarget(null)}
        />
      )}
    </div>
  );
}

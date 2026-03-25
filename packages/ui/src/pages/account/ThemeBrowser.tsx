/**
 * Community Theme Browser page.
 *
 * Allows users to browse, search, and download community-shared themes.
 * Identity-authenticated users can also share their own themes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { useTheme } from '../../hooks/useTheme';
import { useIdentity } from '../../hooks/useIdentity';
import { useAppConfig } from '../../config';
import { createApiClient, type CommunityTheme } from '@adieuu/shared';
import { validateThemeDefinition } from '../../utils/themeSanitizer';

export function ThemeBrowser() {
  const { t } = useTranslation();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const { setAccountTheme, saveCustomTheme, activeTheme, customThemes } = useTheme();
  const { status: identityStatus, identity } = useIdentity();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [themes, setThemes] = useState<CommunityTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'downloads'>('newest');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchThemes = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.themes.list({ page, limit, search: search || undefined, sort });
      if (resp.success && resp.data) {
        setThemes(resp.data.themes);
        setTotal(resp.data.total);
      }
    } catch {
      toast.error(t('account.appearance.communityLoadError'));
    } finally {
      setLoading(false);
    }
  }, [api, page, search, sort, toast, t]);

  useEffect(() => {
    void fetchThemes();
  }, [fetchThemes]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void fetchThemes();
  }, [fetchThemes]);

  const handleUseTheme = useCallback(async (ct: CommunityTheme) => {
    const result = validateThemeDefinition(ct.theme);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await saveCustomTheme(result.theme);
    await setAccountTheme(result.theme);
    toast.success(t('account.appearance.themeApplied'));
  }, [saveCustomTheme, setAccountTheme, toast, t]);

  const handleShareTheme = useCallback(async () => {
    if (!activeTheme || identityStatus !== 'logged_in') return;

    try {
      const resp = await api.themes.create({
        name: activeTheme.name,
        description: activeTheme.description,
        theme: activeTheme,
        tags: [],
      });
      if (resp.success) {
        toast.success(t('account.appearance.themeShared'));
        void fetchThemes();
      } else {
        toast.error(resp.error?.message ?? t('account.appearance.shareError'));
      }
    } catch {
      toast.error(t('account.appearance.shareError'));
    }
  }, [activeTheme, identityStatus, api, toast, t, fetchThemes]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <div className="page-header-content">
            <div>
              <h1 className="page-title">{t('account.appearance.communityTitle')}</h1>
              <p className="page-subtitle">{t('account.appearance.communitySubtitle')}</p>
            </div>
          </div>
        </div>

        {/* Search + Sort */}
        <Card variant="elevated" className="slide-up app-settings-card">
          <form className="theme-browser-controls" onSubmit={handleSearch}>
            <input
              type="text"
              className="theme-browser-search"
              placeholder={t('account.appearance.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="theme-browser-sort"
              value={sort}
              onChange={(e) => { setSort(e.target.value as 'newest' | 'downloads'); setPage(1); }}
            >
              <option value="newest">{t('account.appearance.sortNewest')}</option>
              <option value="downloads">{t('account.appearance.sortPopular')}</option>
            </select>
            <Button type="submit" variant="secondary" size="sm">
              {t('account.appearance.searchButton')}
            </Button>
          </form>
        </Card>

        {/* Share Button */}
        {identityStatus === 'logged_in' && activeTheme && (
          <Card variant="elevated" className="slide-up app-settings-card">
            <div className="theme-share-row">
              <p className="theme-share-label">
                {t('account.appearance.sharePrompt', { name: activeTheme.name })}
              </p>
              <Button variant="primary" size="sm" onClick={() => void handleShareTheme()}>
                {t('account.appearance.shareButton')}
              </Button>
            </div>
          </Card>
        )}

        {/* Theme Grid */}
        {loading ? (
          <div className="theme-browser-loading">
            <Spinner />
          </div>
        ) : themes.length === 0 ? (
          <Card variant="elevated" className="slide-up app-settings-card">
            <p className="theme-browser-empty">{t('account.appearance.noThemes')}</p>
          </Card>
        ) : (
          <>
            <div className="theme-preset-grid theme-browser-grid">
              {themes.map((ct) => (
                <button
                  key={ct.id}
                  type="button"
                  className="theme-preset-card"
                  onClick={() => void handleUseTheme(ct)}
                >
                  <div className="theme-preset-swatches">
                    <span className="theme-swatch" style={{ background: ct.theme.colors.bgPrimary }} />
                    <span className="theme-swatch" style={{ background: ct.theme.colors.accentPrimary }} />
                    <span className="theme-swatch" style={{ background: ct.theme.colors.textPrimary }} />
                    <span className="theme-swatch" style={{ background: ct.theme.colors.bgSecondary }} />
                  </div>
                  <span className="theme-preset-name">{ct.name}</span>
                  <span className="theme-preset-meta">
                    {ct.authorUsername} &middot; {ct.downloads ?? 0} {t('account.appearance.downloads')}
                  </span>
                </button>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="theme-browser-pagination">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t('account.appearance.prevPage')}
                </Button>
                <span className="theme-browser-page-info">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('account.appearance.nextPage')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

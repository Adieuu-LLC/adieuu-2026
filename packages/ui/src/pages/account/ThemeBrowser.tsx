/**
 * Community Theme Browser page.
 *
 * Allows users to browse, search, and download community-shared themes.
 * Identity-authenticated users can also share their own themes and upvote.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { Tooltip } from '../../components/Tooltip';
import { ThemeColorPreviewModal } from '../../components/ThemeColorPreviewModal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../icons/Icon';
import { useToast } from '../../components/Toast';
import { useTheme } from '../../hooks/useTheme';
import { useIdentity } from '../../hooks/useIdentity';
import { useAppConfig } from '../../config';
import { createApiClient, computeColorChecksum, type CommunityTheme } from '@adieuu/shared';
import { validateThemeDefinition } from '../../utils/themeSanitizer';
import { BUILTIN_THEMES } from '../../constants/builtinThemes';
import { SessionLockedPage } from '../../components/SessionLockedPage';

const SEARCH_DEBOUNCE_MS = 400;
const DESC_MAX_LENGTH = 150;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '\u2026';
}

export function ThemeBrowser() {
  const { t } = useTranslation();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const { setAccountTheme, setIdentityTheme, identityThemeId, saveCustomTheme, activeTheme } = useTheme();
  const { status: identityStatus, identity } = useIdentity();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [themes, setThemes] = useState<CommunityTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'downloads' | 'upvotes'>('newest');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const [previewTheme, setPreviewTheme] = useState<CommunityTheme | null>(null);
  const [unshareTarget, setUnshareTarget] = useState<CommunityTheme | null>(null);
  const [unsharing, setUnsharing] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Toast API changes identity every ToastProvider render; keep fetch stable to avoid request races. */
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const handleSearchInput = useCallback((value: string) => {
    setSearch(value);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const fetchThemes = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.themes.list({
        page,
        limit,
        search: debouncedSearch || undefined,
        sort,
      });
      if (resp.success && resp.data && Array.isArray(resp.data.themes)) {
        setThemes(resp.data.themes);
        setTotal(resp.data.total);
        return;
      }
      setThemes([]);
      setTotal(0);
      if (!resp.success) {
        toastRef.current.error(
          t('account.appearance.communityLoadError'),
          resp.error?.message,
        );
      }
    } catch {
      setThemes([]);
      setTotal(0);
      toastRef.current.error(t('account.appearance.communityLoadError'));
    } finally {
      setLoading(false);
    }
  }, [api, page, debouncedSearch, sort, t]);

  useEffect(() => {
    void fetchThemes();
  }, [fetchThemes]);

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setDebouncedSearch(search);
    setPage(1);
  }, [search]);

  const saveAndApply = useCallback(async (ct: CommunityTheme) => {
    const result = validateThemeDefinition(ct.theme);
    if (!result.ok) {
      toast.error(result.error);
      return null;
    }
    return {
      ...result.theme,
      author: ct.authorUsername || undefined,
    };
  }, [toast]);

  const handleSetAccountTheme = useCallback(async (ct: CommunityTheme) => {
    const validated = await saveAndApply(ct);
    if (!validated) return;
    await saveCustomTheme(validated);
    await setAccountTheme(validated);
    toast.success(t('account.appearance.themeSavedToCollection'));
    void api.themes.get(ct.id);
  }, [api, saveAndApply, saveCustomTheme, setAccountTheme, toast, t]);

  const handleSetIdentityTheme = useCallback(async (ct: CommunityTheme) => {
    const validated = await saveAndApply(ct);
    if (!validated) return;
    await saveCustomTheme(validated);
    await setIdentityTheme(validated);
    toast.success(t('account.appearance.themeSetAsIdentity'));
    void api.themes.get(ct.id);
  }, [api, saveAndApply, saveCustomTheme, setIdentityTheme, toast, t]);

  const handleUpvote = useCallback(async (e: React.MouseEvent, ct: CommunityTheme) => {
    e.stopPropagation();

    if (identityStatus !== 'logged_in') {
      toast.error(t('account.appearance.upvoteError'));
      return;
    }

    if (identity && ct.authorIdentityId === identity.id) {
      toast.info(t('account.appearance.upvoteSelfError'));
      return;
    }

    try {
      const resp = await api.themes.upvote(ct.id);
      if (resp.success && resp.data) {
        if (resp.data.upvoted) {
          toast.success(t('account.appearance.upvoteSuccess'));
        } else {
          toast.info(t('account.appearance.upvoteAlready'));
        }
        setThemes((prev) =>
          prev.map((theme) =>
            theme.id === ct.id
              ? { ...theme, upvotes: resp.data!.upvotes }
              : theme
          ),
        );
      } else if (!resp.success) {
        const code = resp.error?.code;
        if (code === 'FORBIDDEN') {
          toast.info(t('account.appearance.upvoteSelfError'));
        } else {
          toast.error(resp.error?.message ?? t('account.appearance.upvoteError'));
        }
      }
    } catch {
      toast.error(t('account.appearance.upvoteError'));
    }
  }, [api, identity, identityStatus, toast, t]);

  const handleShareTheme = useCallback(async () => {
    if (!activeTheme || identityStatus !== 'logged_in') return;

    try {
      const checksum = await computeColorChecksum(activeTheme.colors);

      const builtinChecksums = await Promise.all(
        BUILTIN_THEMES.map((bt) => computeColorChecksum(bt.theme.colors)),
      );
      if (builtinChecksums.includes(checksum)) {
        toast.warning(t('account.appearance.shareBlockedPreset'));
        return;
      }

      const resp = await api.themes.create({
        name: activeTheme.name,
        description: activeTheme.description,
        theme: activeTheme,
        tags: [],
      });
      if (resp.success) {
        toast.success(t('account.appearance.themeShared'));
        void fetchThemes();
      } else if (resp.error?.code === 'CONFLICT') {
        toast.warning(t('account.appearance.shareBlockedDuplicate'));
      } else {
        toast.error(resp.error?.message ?? t('account.appearance.shareError'));
      }
    } catch {
      toast.error(t('account.appearance.shareError'));
    }
  }, [activeTheme, identityStatus, api, toast, t, fetchThemes]);

  const handleUnshare = useCallback(async () => {
    if (!unshareTarget) return;
    setUnsharing(true);
    try {
      const resp = await api.themes.delete(unshareTarget.id);
      if (resp.success) {
        toast.success(t('account.appearance.unshareSuccess'));
        setUnshareTarget(null);
        void fetchThemes();
      } else {
        toast.error(resp.error?.message ?? t('account.appearance.unshareError'));
      }
    } catch {
      toast.error(t('account.appearance.unshareError'));
    } finally {
      setUnsharing(false);
    }
  }, [api, unshareTarget, toast, t, fetchThemes]);

  const totalPages = Math.ceil(total / limit);

  if (identityStatus === 'locked') {
    return <SessionLockedPage titleI18nKey="account.appearance.communityTitle" />;
  }

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
          <form className="theme-browser-controls" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              className="theme-browser-search"
              data-tour="community-search"
              placeholder={t('account.appearance.searchPlaceholder')}
              value={search}
              onChange={(e) => handleSearchInput(e.target.value)}
            />
            <select
              className="theme-browser-sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as 'newest' | 'downloads' | 'upvotes');
                setPage(1);
              }}
            >
              <option value="newest">{t('account.appearance.sortNewest')}</option>
              <option value="downloads">{t('account.appearance.sortPopular')}</option>
              <option value="upvotes">{t('account.appearance.sortUpvoted')}</option>
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

        {/* Theme Results */}
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
            <div className="theme-result-list">
              {themes.map((ct, idx) => (
                <div key={ct.id} className="theme-result-row" {...(idx === 0 ? { 'data-tour': 'community-first-row' } : {})}>
                  {/* 2x2 colour swatch */}
                  <div className="theme-result-swatches">
                    <span className="theme-result-swatch" style={{ background: ct.theme.colors.bgPrimary }} />
                    <span className="theme-result-swatch" style={{ background: ct.theme.colors.accentPrimary }} />
                    <span className="theme-result-swatch" style={{ background: ct.theme.colors.textPrimary }} />
                    <span className="theme-result-swatch" style={{ background: ct.theme.colors.bgSecondary }} />
                  </div>

                  {/* Info */}
                  <div className="theme-result-info">
                    <div className="theme-result-header">
                      <span className="theme-result-name">{ct.name}</span>
                      <span className="theme-result-author">
                        {t('account.appearance.authorLabel', { author: ct.authorUsername })}
                      </span>
                    </div>
                    {ct.description ? (
                      <p
                        className="theme-result-desc"
                        title={ct.description.length > DESC_MAX_LENGTH ? ct.description : undefined}
                      >
                        {truncate(ct.description, DESC_MAX_LENGTH)}
                      </p>
                    ) : null}
                    <span className="theme-result-stats">
                      {ct.downloads ?? 0} {t('account.appearance.downloads')}
                      {' \u00b7 '}
                      {ct.upvotes ?? 0} {t('account.appearance.upvotes')}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="theme-result-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewTheme(ct)}
                      title={t('account.appearance.previewColors')}
                      {...(idx === 0 ? { 'data-tour': 'community-btn-preview' } : {})}
                    >
                      <Icon name="eye" />
                    </Button>

                    {identityStatus === 'logged_in' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleSetIdentityTheme(ct)}
                        title={t('account.appearance.setIdentityTheme')}
                        {...(idx === 0 ? { 'data-tour': 'community-btn-identity' } : {})}
                      >
                        <Icon name="mask" />
                      </Button>
                    )}

                    {identityThemeId ? (
                      <Tooltip content={t('account.appearance.accountThemeOverrideHint')} position="left">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleSetAccountTheme(ct)}
                          title={t('account.appearance.setAccountTheme')}
                          {...(idx === 0 ? { 'data-tour': 'community-btn-account' } : {})}
                        >
                          <Icon name="user" />
                        </Button>
                      </Tooltip>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleSetAccountTheme(ct)}
                        title={t('account.appearance.setAccountTheme')}
                        {...(idx === 0 ? { 'data-tour': 'community-btn-account' } : {})}
                      >
                        <Icon name="user" />
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => void handleUpvote(e, ct)}
                      title={t('account.appearance.upvoteButton')}
                      className="theme-result-upvote-btn"
                      {...(idx === 0 ? { 'data-tour': 'community-btn-upvote' } : {})}
                    >
                      <Icon name="thumbsUp" size="xs" />
                      <span className="theme-upvote-count">{ct.upvotes ?? 0}</span>
                    </Button>

                    {identity && ct.authorIdentityId === identity.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setUnshareTarget(ct)}
                        title={t('account.appearance.unshareButton')}
                        className="theme-result-unshare-btn"
                      >
                        <Icon name="trash" />
                      </Button>
                    )}
                  </div>
                </div>
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
                  {t('account.appearance.paginationInfo', {
                    start: (page - 1) * limit + 1,
                    end: Math.min(page * limit, total),
                    total,
                  })}
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

        {/* Colour Preview Modal */}
        {previewTheme && (
          <ThemeColorPreviewModal
            open={!!previewTheme}
            onOpenChange={(open) => { if (!open) setPreviewTheme(null); }}
            title={t('account.appearance.previewModalTitle', { name: previewTheme.name })}
            colors={previewTheme.theme.colors}
          />
        )}

        {/* Unshare Confirmation */}
        <ConfirmDialog
          open={!!unshareTarget}
          onOpenChange={(open) => { if (!open) setUnshareTarget(null); }}
          title={t('account.appearance.unshareConfirmTitle')}
          description={t('account.appearance.unshareConfirmDesc', { name: unshareTarget?.name ?? '' })}
          confirmLabel={t('account.appearance.unshareButton')}
          variant="danger"
          loading={unsharing}
          onConfirm={() => void handleUnshare()}
        />
      </div>
    </div>
  );
}


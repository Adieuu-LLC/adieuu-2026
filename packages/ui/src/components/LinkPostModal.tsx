import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Portal, Select, createListCollection } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_LINK_TYPES,
  createApiClient,
  type FeedbackLinkType,
  type PublicFeedbackPost,
} from '@adieuu/shared';
import { useAppConfig } from '../config';
import { Button } from './Button';
import { Spinner } from './Spinner';

const SEARCH_DEBOUNCE_MS = 400;

interface LinkPostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPostId: string;
  onConfirm: (linkedPostId: string, linkType: FeedbackLinkType) => void;
  loading?: boolean;
}

export function LinkPostModal({
  open,
  onOpenChange,
  currentPostId,
  onConfirm,
  loading = false,
}: LinkPostModalProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [results, setResults] = useState<PublicFeedbackPost[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PublicFeedbackPost | null>(null);
  const [linkType, setLinkType] = useState<FeedbackLinkType>('related');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const linkTypeCollection = useMemo(
    () =>
      createListCollection({
        items: FEEDBACK_LINK_TYPES.map((type) => ({
          value: type,
          label: t(`feedback.linkTypes.${type}`),
        })),
      }),
    [t],
  );

  const resetState = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
    setResults([]);
    setSelectedPost(null);
    setLinkType('related');
    setSearching(false);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        resetState();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, resetState],
  );

  const handleSearchInput = useCallback((value: string) => {
    setSearch(value);
    setSelectedPost(null);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const trimmedSearch = debouncedSearch.trim();
    if (trimmedSearch.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    void (async () => {
      try {
        const res = await api.feedback.listPosts({
          search: trimmedSearch,
          limit: 10,
          page: 1,
        });

        if (cancelled) return;

        if (res.success && res.data) {
          setResults(res.data.items.filter((item) => item.postId !== currentPostId));
        } else {
          setResults([]);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[LinkPostModal] search failed', err);
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, currentPostId, debouncedSearch, open]);

  const canConfirm = Boolean(selectedPost) && !loading;

  const summaryText =
    selectedPost &&
    t(`feedback.linkPostSummary.${linkType}`, { title: selectedPost.title });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => handleOpenChange(e.open)}
      closeOnInteractOutside={!loading}
    >
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content feedback-link-modal">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('feedback.linkPostModalTitle')}
              </Dialog.Title>
            </div>

            <div className="confirm-dialog-body">
              <div className="feedback-link-modal-field">
                <label className="input-label" htmlFor="feedback-link-search">
                  {t('feedback.linkPostSearch')}
                </label>
                <input
                  id="feedback-link-search"
                  type="text"
                  className="input feedback-link-modal-search"
                  placeholder={t('feedback.linkPostSearch')}
                  value={search}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </div>

              {searching && (
                <div className="feedback-link-modal-loading">
                  <Spinner size="sm" />
                </div>
              )}

              {!searching && debouncedSearch.trim().length > 0 && results.length === 0 && (
                <p className="input-hint">{t('feedback.linkPostNoResults')}</p>
              )}

              {!searching && results.length > 0 && (
                <ul className="feedback-link-modal-results" role="listbox">
                  {results.map((result) => (
                    <li key={result.postId}>
                      <button
                        type="button"
                        className={`feedback-link-modal-result${selectedPost?.postId === result.postId ? ' feedback-link-modal-result--selected' : ''}`}
                        onClick={() => setSelectedPost(result)}
                        disabled={loading}
                      >
                        <span className="feedback-link-modal-result-title">{result.title}</span>
                        <span className={`feedback-category-badge feedback-category-${result.category}`}>
                          {t(`feedback.categories.${result.category}`)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {selectedPost && (
                <>
                  <div className="feedback-link-modal-field">
                    <label className="input-label">{t('feedback.linkPostSelectType')}</label>
                    <Select.Root
                      collection={linkTypeCollection}
                      value={[linkType]}
                      disabled={loading}
                      onValueChange={(details) => {
                        const next = details.value[0] as FeedbackLinkType | undefined;
                        if (next) {
                          setLinkType(next);
                        }
                      }}
                    >
                      <Select.Control className="report-select-control">
                        <Select.Trigger className="report-select-trigger">
                          <Select.ValueText />
                        </Select.Trigger>
                      </Select.Control>
                      <Portal>
                        <Select.Positioner>
                          <Select.Content className="report-select-content">
                            {linkTypeCollection.items.map((item) => (
                              <Select.Item key={item.value} item={item} className="report-select-item">
                                <Select.ItemText>{item.label}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Positioner>
                      </Portal>
                    </Select.Root>
                  </div>

                  {summaryText && (
                    <p className="feedback-link-modal-summary">{summaryText}</p>
                  )}
                </>
              )}
            </div>

            <div className="confirm-dialog-footer">
              <Button
                variant="secondary"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (selectedPost) {
                    onConfirm(selectedPost.postId, linkType);
                  }
                }}
                disabled={!canConfirm}
              >
                {loading ? t('common.loading') : t('feedback.linkPostConfirm')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_CATEGORIES,
  createApiClient,
  FEEDBACK_LIST_DEFAULT_SORT,
  FEEDBACK_LIST_PAGE_SIZE,
  getFeedbackListDefaultStatuses,
  shouldShowFeedbackAuthorCredit,
  type FeedbackCategory,
  type FeedbackSortOption,
  type FeedbackStatus,
  type PublicFeedbackPost,
} from '@adieuu/shared';
import { Select, Switch, Portal, createListCollection } from '@ark-ui/react';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { Icon } from '../../icons/Icon';
import { FeedbackAuthorLink } from '../../components/FeedbackAuthorLink';
import { FeedbackStatusFilter } from '../../components/FeedbackStatusFilter';
import { useFeedbackParticipation } from '../../hooks/useFeedbackParticipation';
import { useFeedbackNotificationPrefs } from '../../hooks/useFeedbackNotificationPrefs';
import { useIdentity } from '../../hooks/useIdentity';
import { useToast } from '../../components/Toast';

const SEARCH_DEBOUNCE_MS = 400;
const DESC_MAX_LENGTH = 200;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '\u2026';
}

type FeedbackStaffFilter = 'all' | 'yes' | 'no';

export function FeedbackList() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const { requireIdentitySession } = useFeedbackParticipation();
  const { status: identityStatus, identity } = useIdentity();
  const isLoggedIn = identityStatus === 'logged_in';
  const notifPrefs = useFeedbackNotificationPrefs(isLoggedIn);
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const currentIdentityId = isLoggedIn ? identity?.id ?? null : null;

  const [items, setItems] = useState<PublicFeedbackPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<FeedbackSortOption>(FEEDBACK_LIST_DEFAULT_SORT);
  const [categoryFilter, setCategoryFilter] = useState<FeedbackCategory | ''>('');
  const [statusFilters, setStatusFilters] = useState<FeedbackStatus[]>(() =>
    getFeedbackListDefaultStatuses(),
  );
  const [staffResponseFilter, setStaffResponseFilter] = useState<FeedbackStaffFilter>('all');
  const [notifPrefsOpen, setNotifPrefsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = FEEDBACK_LIST_PAGE_SIZE;
  const isInitialPageRef = useRef(true);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isInitialPageRef.current) {
      isInitialPageRef.current = false;
      return;
    }
    document.querySelector('.app-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  const sortCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: 'upvotes', label: t('feedback.sortUpvotes') },
          { value: 'newest', label: t('feedback.sortNewest') },
          { value: 'oldest', label: t('feedback.sortOldest') },
        ],
      }),
    [t],
  );

  const sortDisplayLabel = useMemo(() => {
    const labels: Record<FeedbackSortOption, string> = {
      newest: t('feedback.sortNewest'),
      oldest: t('feedback.sortOldest'),
      upvotes: t('feedback.sortUpvotes'),
    };
    return t('feedback.sortWithValue', { value: labels[sort] });
  }, [sort, t]);

  const categoryCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: '', label: t('feedback.filterCategoryAll') },
          ...FEEDBACK_CATEGORIES.map((c) => ({
            value: c,
            label: t(`feedback.categories.${c}`),
          })),
        ],
      }),
    [t],
  );

  const staffResponseCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: 'all', label: t('feedback.filterStaffResponseAll') },
          { value: 'yes', label: t('feedback.filterStaffResponseYes') },
          { value: 'no', label: t('feedback.filterStaffResponseNo') },
        ],
      }),
    [t],
  );

  const handleSearchInput = useCallback((value: string) => {
    setSearch(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
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

  const fetchPosts = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    try {
      const res = await api.feedback.listPosts(
        {
          page,
          limit,
          sort,
          search: debouncedSearch || undefined,
          category: categoryFilter || undefined,
          statuses: statusFilters,
          hasStaffResponse:
            staffResponseFilter === 'yes' ? true : staffResponseFilter === 'no' ? false : undefined,
        },
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return;

      if (res.success && res.data) {
        setItems(res.data.items);
        setTotal(res.data.total);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('[FeedbackList] fetchPosts failed', err);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [api, page, limit, sort, debouncedSearch, categoryFilter, statusFilters, staffResponseFilter]);

  useEffect(() => {
    void fetchPosts();
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [fetchPosts]);

  const handleUpvote = useCallback(
    async (post: PublicFeedbackPost) => {
      if (!requireIdentitySession()) {
        toast.info(t('feedback.loginToVote'));
        return;
      }

      try {
        const res = post.hasUpvoted
          ? await api.feedback.removeUpvote(post.postId)
          : await api.feedback.upvotePost(post.postId);

        if (res.success && res.data) {
          setItems((prev) =>
            prev.map((p) =>
              p.postId === post.postId
                ? { ...p, upvoteCount: res.data!.upvoteCount, hasUpvoted: res.data!.hasUpvoted }
                : p,
            ),
          );
          return;
        }

        toast.error(res.error?.message ?? t('feedback.upvoteError'));
      } catch {
        toast.error(t('feedback.upvoteError'));
      }
    },
    [api, requireIdentitySession, t, toast],
  );

  const handleNewPost = useCallback(() => {
    if (!requireIdentitySession()) {
      toast.info(t('feedback.loginToParticipate'));
      return;
    }
    navigate('/feedback/new');
  }, [navigate, requireIdentitySession, t, toast]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="page-content feedback-page">
      <div className="container">
        <div className="page-header">
          <div className="page-header-content">
            <div>
              <h1 className="page-title">{t('feedback.title')}</h1>
              <p className="page-subtitle">{t('feedback.subtitle')}</p>
              <p className="feedback-roadmap-link">
                <Link to="/about/roadmap">{t('feedback.viewRoadmap')}</Link>
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={handleNewPost}>
              {t('feedback.newPost')}
            </Button>
          </div>
        </div>

        {isLoggedIn && (
          <Card variant="elevated" className="feedback-notification-prefs-card">
            <button
              type="button"
              className="feedback-notif-prefs-toggle"
              onClick={() => setNotifPrefsOpen((prev) => !prev)}
              aria-expanded={notifPrefsOpen}
            >
              <Icon name="bell" size="sm" />
              <span>{t('feedback.notifications.prefsTitle')}</span>
              <Icon
                name={notifPrefsOpen ? 'chevronUp' : 'chevronDown'}
                size="xs"
                className="feedback-notif-prefs-chevron"
              />
            </button>
            {notifPrefsOpen && (
              <div className="feedback-notification-prefs">
                <Switch.Root
                  checked={notifPrefs.notifyPostReplies}
                  onCheckedChange={notifPrefs.togglePostReplies}
                  className="sidebar-filter-switch feedback-notif-switch"
                >
                  <Switch.Label className="sidebar-filter-switch-label">
                    {t('feedback.notifications.notifyPostReplies')}
                  </Switch.Label>
                  <Switch.Control className="sidebar-filter-switch-control">
                    <Switch.Thumb className="sidebar-filter-switch-thumb" />
                  </Switch.Control>
                  <Switch.HiddenInput />
                </Switch.Root>
                <Switch.Root
                  checked={notifPrefs.notifyCommentReplies}
                  onCheckedChange={notifPrefs.toggleCommentReplies}
                  className="sidebar-filter-switch feedback-notif-switch"
                >
                  <Switch.Label className="sidebar-filter-switch-label">
                    {t('feedback.notifications.notifyCommentReplies')}
                  </Switch.Label>
                  <Switch.Control className="sidebar-filter-switch-control">
                    <Switch.Thumb className="sidebar-filter-switch-thumb" />
                  </Switch.Control>
                  <Switch.HiddenInput />
                </Switch.Root>
              </div>
            )}
          </Card>
        )}

        <Card variant="elevated" className="feedback-controls-card">
          <div className="feedback-controls">
            <input
              type="text"
              className="feedback-search-input"
              placeholder={t('feedback.searchPlaceholder')}
              value={search}
              onChange={(e) => handleSearchInput(e.target.value)}
            />

            <Select.Root
              collection={sortCollection}
              value={[sort]}
              onValueChange={(d) => {
                const next = d.value[0] as FeedbackSortOption | undefined;
                if (next) {
                  setSort(next);
                  setPage(1);
                }
              }}
            >
              <Select.Control className="report-select-control">
                <Select.Trigger className="report-select-trigger feedback-filter-trigger">
                  <span className="feedback-sort-label">{sortDisplayLabel}</span>
                  <Icon name="chevronDown" size="xs" />
                </Select.Trigger>
              </Select.Control>
              <Portal>
                <Select.Positioner>
                  <Select.Content className="report-select-content">
                    {sortCollection.items.map((item) => (
                      <Select.Item key={item.value} item={item} className="report-select-item">
                        <Select.ItemText>{item.label}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>

            <Select.Root
              collection={categoryCollection}
              value={[categoryFilter]}
              onValueChange={(d) => {
                setCategoryFilter((d.value[0] as FeedbackCategory | '') ?? '');
                setPage(1);
              }}
            >
              <Select.Control className="report-select-control">
                <Select.Trigger className="report-select-trigger feedback-filter-trigger">
                  <Select.ValueText placeholder={t('feedback.filterCategoryAll')} />
                </Select.Trigger>
              </Select.Control>
              <Portal>
                <Select.Positioner>
                  <Select.Content className="report-select-content">
                    {categoryCollection.items.map((item) => (
                      <Select.Item key={item.value} item={item} className="report-select-item">
                        <Select.ItemText>{item.label}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>

            <div className="feedback-filter-status-row">
              <FeedbackStatusFilter
                value={statusFilters}
                onChange={(statuses) => {
                  setStatusFilters(statuses);
                  setPage(1);
                }}
              />

              <Select.Root
                collection={staffResponseCollection}
                value={[staffResponseFilter]}
                onValueChange={(d) => {
                  setStaffResponseFilter((d.value[0] as FeedbackStaffFilter) ?? 'all');
                  setPage(1);
                }}
              >
                <Select.Control className="report-select-control">
                  <Select.Trigger className="report-select-trigger feedback-filter-trigger">
                    <Select.ValueText placeholder={t('feedback.filterStaffResponse')} />
                  </Select.Trigger>
                </Select.Control>
                <Portal>
                  <Select.Positioner>
                    <Select.Content className="report-select-content">
                      {staffResponseCollection.items.map((item) => (
                        <Select.Item key={item.value} item={item} className="report-select-item">
                          <Select.ItemText>{item.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="feedback-loading">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <Card variant="elevated">
            <p className="feedback-empty">{t('feedback.empty')}</p>
          </Card>
        ) : (
          <>
            <div className="feedback-list">
              {items.map((post) => (
                <div
                  key={post.postId}
                  className={`feedback-card feedback-card--status-${post.status}`}
                >
                  <div className="feedback-card-main">
                    <Link to={`/feedback/${post.postId}`} className="feedback-card-link">
                      <div className="feedback-card-header">
                        <span className={`feedback-category-badge feedback-category-${post.category}`}>
                          {t(`feedback.categories.${post.category}`)}
                        </span>
                        {post.status !== 'submitted' && (
                          <span className={`feedback-status-badge feedback-status-${post.status}`}>
                            {t(`feedback.statuses.${post.status}`)}
                          </span>
                        )}
                        {post.isRoadmapOfficial && (
                          <span className="feedback-official-badge">
                            {t('feedback.officialBadge')}
                          </span>
                        )}
                        {post.hasStaffResponse && (
                          <span className="feedback-staff-response-badge">
                            {t('feedback.staffResponse')}
                          </span>
                        )}
                      </div>
                      <h2 className="feedback-card-title">{post.title}</h2>
                      <p className="feedback-card-description">
                        {post.description.length > 0
                          ? truncate(post.description, DESC_MAX_LENGTH)
                          : '\u2014'}
                      </p>
                    </Link>
                    <div className="feedback-card-meta">
                      {shouldShowFeedbackAuthorCredit(post) && (
                        <FeedbackAuthorLink author={post.author} layout="post-list" />
                      )}
                      <span className="feedback-card-stats">
                        {t('feedback.commentCount', { count: post.commentCount })}
                      </span>
                    </div>
                  </div>
                  {currentIdentityId === post.author.identityId ? (
                    <div
                      className="feedback-upvote-btn feedback-upvote-btn--list feedback-upvote-btn--readonly"
                      role="status"
                      aria-label={t('feedback.upvoteCount', { count: post.upvoteCount })}
                    >
                      <Icon name="plus" />
                      <span className="feedback-upvote-count">{post.upvoteCount}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`feedback-upvote-btn feedback-upvote-btn--list ${post.hasUpvoted ? 'feedback-upvote-btn--active' : ''}`}
                      onClick={() => void handleUpvote(post)}
                      aria-label={t('feedback.upvoteButton')}
                    >
                      <Icon name="plus" />
                      <span className="feedback-upvote-count">{post.upvoteCount}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="feedback-pagination">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t('common.previous', 'Previous')}
                </Button>
                <span className="feedback-pagination-label">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('common.next', 'Next')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

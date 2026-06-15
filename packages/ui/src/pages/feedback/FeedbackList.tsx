import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  createApiClient,
  type FeedbackCategory,
  type FeedbackSortOption,
  type FeedbackStatus,
  type PublicFeedbackPost,
} from '@adieuu/shared';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { Icon } from '../../icons/Icon';
import { Avatar } from '../../components/Avatar';
import { useFeedbackParticipation } from '../../hooks/useFeedbackParticipation';
import { useToast } from '../../components/Toast';

const SEARCH_DEBOUNCE_MS = 400;
const DESC_MAX_LENGTH = 200;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '\u2026';
}

export function FeedbackList() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const { requireIdentitySession } = useFeedbackParticipation();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [items, setItems] = useState<PublicFeedbackPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<FeedbackSortOption>('newest');
  const [categoryFilter, setCategoryFilter] = useState<FeedbackCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | ''>('');
  const [staffResponseFilter, setStaffResponseFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categoryCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: '', label: t('feedback.filterAll') },
          ...FEEDBACK_CATEGORIES.map((c) => ({
            value: c,
            label: t(`feedback.categories.${c}`),
          })),
        ],
      }),
    [t],
  );

  const statusCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: '', label: t('feedback.filterAll') },
          ...FEEDBACK_STATUSES.map((s) => ({
            value: s,
            label: t(`feedback.statuses.${s}`),
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
    setLoading(true);
    try {
      const res = await api.feedback.listPosts({
        page,
        limit,
        sort,
        search: debouncedSearch || undefined,
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
        hasStaffResponse:
          staffResponseFilter === 'yes' ? true : staffResponseFilter === 'no' ? false : undefined,
      });

      if (res.success && res.data) {
        setItems(res.data.items);
        setTotal(res.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [api, page, limit, sort, debouncedSearch, categoryFilter, statusFilter, staffResponseFilter]);

  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  const handleUpvote = useCallback(
    async (e: React.MouseEvent, post: PublicFeedbackPost) => {
      e.preventDefault();
      e.stopPropagation();
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
            </div>
            <Button variant="primary" size="sm" onClick={handleNewPost}>
              {t('feedback.newPost')}
            </Button>
          </div>
        </div>

        <Card variant="elevated" className="feedback-controls-card">
          <div className="feedback-controls">
            <input
              type="text"
              className="feedback-search-input"
              placeholder={t('feedback.searchPlaceholder')}
              value={search}
              onChange={(e) => handleSearchInput(e.target.value)}
            />

            <select
              className="feedback-filter-select"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as FeedbackSortOption);
                setPage(1);
              }}
              aria-label={t('feedback.sortLabel')}
            >
              <option value="newest">{t('feedback.sortNewest')}</option>
              <option value="oldest">{t('feedback.sortOldest')}</option>
              <option value="upvotes">{t('feedback.sortUpvotes')}</option>
            </select>

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
                  <Select.ValueText placeholder={t('feedback.filterCategory')} />
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

            <Select.Root
              collection={statusCollection}
              value={[statusFilter]}
              onValueChange={(d) => {
                setStatusFilter((d.value[0] as FeedbackStatus | '') ?? '');
                setPage(1);
              }}
            >
              <Select.Control className="report-select-control">
                <Select.Trigger className="report-select-trigger feedback-filter-trigger">
                  <Select.ValueText placeholder={t('feedback.filterStatus')} />
                </Select.Trigger>
              </Select.Control>
              <Portal>
                <Select.Positioner>
                  <Select.Content className="report-select-content">
                    {statusCollection.items.map((item) => (
                      <Select.Item key={item.value} item={item} className="report-select-item">
                        <Select.ItemText>{item.label}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>

            <Select.Root
              collection={staffResponseCollection}
              value={[staffResponseFilter]}
              onValueChange={(d) => {
                setStaffResponseFilter((d.value[0] as 'all' | 'yes' | 'no') ?? 'all');
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
                <Link key={post.postId} to={`/feedback/${post.postId}`} className="feedback-card">
                  <div className="feedback-card-main">
                    <div className="feedback-card-header">
                      <span className={`feedback-category-badge feedback-category-${post.category}`}>
                        {t(`feedback.categories.${post.category}`)}
                      </span>
                      <span className={`feedback-status-badge feedback-status-${post.status}`}>
                        {t(`feedback.statuses.${post.status}`)}
                      </span>
                      {post.hasStaffResponse && (
                        <span className="feedback-staff-response-badge">
                          {t('feedback.staffResponse')}
                        </span>
                      )}
                    </div>
                    <h2 className="feedback-card-title">{post.title}</h2>
                    <p className="feedback-card-description">
                      {truncate(post.description, DESC_MAX_LENGTH)}
                    </p>
                    <div className="feedback-card-meta">
                      <Avatar
                        src={post.author.avatarUrl}
                        name={post.author.displayName}
                        size="sm"
                      />
                      <span className="feedback-card-author">
                        {t('feedback.authorLabel', { username: post.author.username })}
                      </span>
                      <span className="feedback-card-stats">
                        {t('feedback.commentCount', { count: post.commentCount })}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`feedback-upvote-btn ${post.hasUpvoted ? 'feedback-upvote-btn--active' : ''}`}
                    onClick={(e) => void handleUpvote(e, post)}
                    aria-label={t('feedback.upvoteButton')}
                  >
                    <Icon name="thumbsUp" />
                    <span>{post.upvoteCount}</span>
                  </button>
                </Link>
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

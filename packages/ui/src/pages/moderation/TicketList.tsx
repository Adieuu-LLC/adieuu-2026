import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createApiClient, TICKET_CATEGORIES, type PublicSupportTicket } from '@adieuu/shared';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';

const STATUS_OPTIONS = ['open', 'in_progress', 'escalated', 'resolved', 'closed'] as const;
const ASSIGNED_OPTIONS = ['all', 'me', 'unassigned'] as const;

export function TicketList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const statusFilter = searchParams.get('status') ?? 'open,in_progress';
  const assignedFilter = searchParams.get('assigned') ?? 'all';
  const categoryFilter = searchParams.get('category') ?? '';

  const [tickets, setTickets] = useState<PublicSupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = 25;

  const statusCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: 'open,in_progress', label: t('moderation.tickets.statusOpenInProgress') },
          ...STATUS_OPTIONS.map((s) => ({ value: s, label: t(`moderation.tickets.status.${s}`) })),
          { value: 'all', label: t('moderation.tickets.statusAll') },
        ],
      }),
    [t],
  );

  const assignedCollection = useMemo(
    () =>
      createListCollection({
        items: ASSIGNED_OPTIONS.map((a) => ({
          value: a,
          label: t(`moderation.tickets.assigned.${a}`),
        })),
      }),
    [t],
  );

  const categoryCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: '', label: t('moderation.tickets.statusAll') },
          ...TICKET_CATEGORIES.map((c) => ({
            value: c,
            label: t(`moderation.tickets.category.${c}`),
          })),
        ],
      }),
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params: Record<string, string> = {
      page: String(currentPage),
      limit: String(limit),
    };
    if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
    if (assignedFilter && assignedFilter !== 'all') params.assigned = assignedFilter;
    if (categoryFilter) params.category = categoryFilter;

    const res = await api.moderation.listTickets(params);
    if (res.success && res.data) {
      setTickets(res.data.tickets);
      setTotal(res.data.total);
    } else {
      setError(t('moderation.tickets.loadError'));
    }
    setLoading(false);
  }, [api, assignedFilter, categoryFilter, currentPage, statusFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    next.set('page', '1');
    setSearchParams(next);
  };

  const goToPage = (page: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    setSearchParams(next);
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{t('moderation.tickets.title')}</h1>
        <p className="admin-page-subtitle">{t('moderation.tickets.subtitle')}</p>
      </div>

      <div className="admin-card" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', padding: '0.75rem 1rem' }}>
        <div className="input-wrapper" style={{ minWidth: '12rem', flex: '1 1 12rem', maxWidth: '20rem' }}>
          <label className="input-label">{t('moderation.tickets.filterStatus')}</label>
          <Select.Root
            collection={statusCollection}
            value={[statusFilter]}
            onValueChange={(d) => updateFilter('status', d.value[0] ?? 'open,in_progress')}
          >
            <Select.Control className="report-select-control">
              <Select.Trigger className="report-select-trigger">
                <Select.ValueText />
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
        </div>

        <div className="input-wrapper" style={{ minWidth: '12rem', flex: '1 1 12rem', maxWidth: '20rem' }}>
          <label className="input-label">{t('moderation.tickets.filterAssigned')}</label>
          <Select.Root
            collection={assignedCollection}
            value={[assignedFilter]}
            onValueChange={(d) => updateFilter('assigned', d.value[0] ?? 'all')}
          >
            <Select.Control className="report-select-control">
              <Select.Trigger className="report-select-trigger">
                <Select.ValueText />
              </Select.Trigger>
            </Select.Control>
            <Portal>
              <Select.Positioner>
                <Select.Content className="report-select-content">
                  {assignedCollection.items.map((item) => (
                    <Select.Item key={item.value} item={item} className="report-select-item">
                      <Select.ItemText>{item.label}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>
        </div>

        <div className="input-wrapper" style={{ minWidth: '12rem', flex: '1 1 12rem', maxWidth: '20rem' }}>
          <label className="input-label">{t('moderation.tickets.filterCategory')}</label>
          <Select.Root
            collection={categoryCollection}
            value={[categoryFilter]}
            onValueChange={(d) => updateFilter('category', d.value[0] ?? '')}
          >
            <Select.Control className="report-select-control">
              <Select.Trigger className="report-select-trigger">
                <Select.ValueText />
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
        </div>

        <Button variant="secondary" size="sm" onClick={() => void load()}>
          {t('moderation.tickets.refresh')}
        </Button>
      </div>

      {error && <p className="admin-alert admin-alert--error">{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t('moderation.tickets.col.status')}</th>
              <th>{t('moderation.tickets.col.category')}</th>
              <th>{t('moderation.tickets.col.title')}</th>
              <th>{t('moderation.tickets.col.submitter')}</th>
              <th>{t('moderation.tickets.col.created')}</th>
              <th>{t('moderation.tickets.col.assigned')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                  <span className="spinner spinner-lg" />
                </td>
              </tr>
            ) : tickets.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                  {t('moderation.tickets.empty')}
                </td>
              </tr>
            ) : (
              tickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  className="moderation-report-row"
                  onClick={() => navigate(`/moderation/tickets/${ticket.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <span className={`moderation-status-badge moderation-status-${ticket.status}`}>
                      {t(`moderation.tickets.status.${ticket.status}`)}
                    </span>
                  </td>
                  <td>{t(`moderation.tickets.category.${ticket.category}`)}</td>
                  <td>{ticket.title}</td>
                  <td>
                    {ticket.submitterType} ({ticket.submitterId.slice(0, 8)}…)
                  </td>
                  <td>{new Date(ticket.createdAt).toLocaleString()}</td>
                  <td>{ticket.assignedTo ? `${ticket.assignedTo.slice(0, 8)}…` : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="admin-action-bar" style={{ marginTop: '1rem' }}>
          <Button variant="secondary" size="sm" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
            {t('moderation.tickets.prev')}
          </Button>
          <span>{t('moderation.tickets.pageOf', { current: currentPage, total: totalPages })}</span>
          <Button variant="secondary" size="sm" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>
            {t('moderation.tickets.next')}
          </Button>
        </div>
      )}
    </div>
  );
}

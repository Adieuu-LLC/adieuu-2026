import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createApiClient, type PublicSupportTicket } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { Alert } from '../../components/Alert';

export function MyTickets() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const [tickets, setTickets] = useState<PublicSupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await api.supportTickets.listTickets({ page: currentPage, limit });
    if (res.success && res.data) {
      setTickets(res.data.tickets);
      setTotal(res.data.total);
    } else {
      setError(t('support.loadError'));
    }
    setLoading(false);
  }, [api, currentPage, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const goToPage = (page: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    setSearchParams(next);
  };

  return (
    <div className="page-content support-page">
      <div className="container">
        <div className="page-header support-page-header">
          <div>
            <h1 className="page-title">{t('support.myTickets')}</h1>
            <p className="page-subtitle">{t('support.subtitle')}</p>
          </div>
          <Button onClick={() => navigate('/support/new')}>{t('support.newTicket')}</Button>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <Card variant="elevated">
          {loading ? (
            <div className="support-loading">
              <Spinner />
            </div>
          ) : tickets.length === 0 ? (
            <p className="admin-empty">{t('support.empty')}</p>
          ) : (
            <>
              <div className="support-ticket-table admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t('support.detail.ticketId')}</th>
                      <th>{t('support.form.title')}</th>
                      <th>{t('support.detail.category')}</th>
                      <th>{t('support.detail.status')}</th>
                      <th>{t('support.detail.created')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => (
                      <tr
                        key={ticket.ticketId}
                        className="admin-table-row--clickable"
                        onClick={() => navigate(`/support/${ticket.ticketId}`)}
                      >
                        <td>
                          <Link to={`/support/${ticket.ticketId}`} onClick={(e) => e.stopPropagation()}>
                            {ticket.ticketId}
                          </Link>
                        </td>
                        <td>{ticket.title}</td>
                        <td>{t(`support.categories.${ticket.category}`)}</td>
                        <td>
                          <span className={`moderation-status-badge moderation-status-${ticket.status}`}>
                            {t(`support.status.${ticket.status}`)}
                          </span>
                        </td>
                        <td>{new Date(ticket.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="support-ticket-list">
                {tickets.map((ticket) => (
                  <li key={ticket.ticketId}>
                    <Link to={`/support/${ticket.ticketId}`} className="support-ticket-list-item">
                      <span className="support-ticket-list-title">{ticket.title}</span>
                      <span className="support-ticket-list-id">{ticket.ticketId}</span>
                      <span className="support-ticket-list-meta">
                        <span className={`moderation-status-badge moderation-status-${ticket.status}`}>
                          {t(`support.status.${ticket.status}`)}
                        </span>
                        <span className="support-ticket-list-category">
                          {t(`support.categories.${ticket.category}`)}
                        </span>
                      </span>
                      <time className="support-ticket-list-date">
                        {new Date(ticket.createdAt).toLocaleString()}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {totalPages > 1 && (
          <div className="admin-action-bar support-pagination">
            <Button variant="secondary" size="sm" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
              {t('moderation.reports.prev')}
            </Button>
            <span>{t('moderation.reports.pageOf', { current: currentPage, total: totalPages })}</span>
            <Button variant="secondary" size="sm" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>
              {t('moderation.reports.next')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

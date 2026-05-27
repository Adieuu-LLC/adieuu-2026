import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createApiClient, type AdminUserSearchItem } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Input } from '../../components/Input';
import { Spinner } from '../../components/Spinner';

export function AdminUserSearch() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminUserSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setSearched(false);
        return;
      }
      setLoading(true);
      setError(null);
      const res = await api.admin.searchUsers(q.trim());
      if (res.success && res.data) {
        setResults(res.data.users);
      } else {
        setError(t('admin.users.searchError'));
        setResults([]);
      }
      setSearched(true);
      setLoading(false);
    },
    [api, t],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doSearch(val);
    }, 400);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void doSearch(query);
    }
  };

  const statusBadge = (status: AdminUserSearchItem['status']) => {
    const cls =
      status === 'banned'
        ? 'admin-badge admin-badge--danger'
        : status === 'suspended'
          ? 'admin-badge admin-badge--warning'
          : 'admin-badge admin-badge--success';
    return <span className={cls}>{t(`admin.users.status.${status}`)}</span>;
  };

  return (
    <div className="admin-page">
      <h2 className="admin-page-title">{t('admin.users.title')}</h2>
      <p className="admin-page-subtitle">{t('admin.users.subtitle')}</p>

      <div className="admin-card">
        <Input
          placeholder={t('admin.users.searchPlaceholder')}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          inputSize="lg"
          autoFocus
        />
      </div>

      {loading && (
        <div className="admin-loading">
          <Spinner size="sm" />
        </div>
      )}

      {error && <div className="admin-alert admin-alert--error">{error}</div>}

      {searched && !loading && results.length === 0 && !error && (
        <div className="admin-empty">{t('admin.users.noResults')}</div>
      )}

      {results.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.users.table.id')}</th>
                <th>{t('admin.users.table.contact')}</th>
                <th>{t('admin.users.table.displayName')}</th>
                <th>{t('admin.users.table.created')}</th>
                <th>{t('admin.users.table.status')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((user) => (
                <tr
                  key={user.id}
                  className="admin-table-row--clickable"
                  onClick={() => navigate(`/admin/users/${user.id}`)}
                >
                  <td className="admin-table-mono">{user.id}</td>
                  <td>{user.email || user.phone || '—'}</td>
                  <td>{user.displayName || '—'}</td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>{statusBadge(user.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

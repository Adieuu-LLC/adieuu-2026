import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createApiClient, type AdminIdentitySearchItem } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Input } from '../../components/Input';
import { Spinner } from '../../components/Spinner';

export function AdminIdentitySearch() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminIdentitySearchItem[]>([]);
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
      const res = await api.admin.searchIdentities(q.trim());
      if (res.success && res.data) {
        setResults(res.data.identities);
      } else {
        setError(t('admin.identities.searchError'));
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

  const statusBadge = (status: AdminIdentitySearchItem['status']) => {
    const cls =
      status === 'banned'
        ? 'admin-badge admin-badge--danger'
        : status === 'suspended'
          ? 'admin-badge admin-badge--warning'
          : 'admin-badge admin-badge--success';
    return <span className={cls}>{t(`admin.identities.status.${status}`)}</span>;
  };

  return (
    <div className="admin-page">
      <h2 className="admin-page-title">{t('admin.identities.title')}</h2>
      <p className="admin-page-subtitle">{t('admin.identities.subtitle')}</p>

      <div className="admin-card">
        <Input
          placeholder={t('admin.identities.searchPlaceholder')}
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
        <div className="admin-empty">{t('admin.identities.noResults')}</div>
      )}

      {results.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.identities.table.id')}</th>
                <th>{t('admin.identities.table.username')}</th>
                <th>{t('admin.identities.table.displayName')}</th>
                <th>{t('admin.identities.table.created')}</th>
                <th>{t('admin.identities.table.status')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((identity) => (
                <tr
                  key={identity.id}
                  className="admin-table-row--clickable"
                  onClick={() => navigate(`/admin/identities/${identity.id}`)}
                >
                  <td className="admin-table-mono">{identity.id}</td>
                  <td>{identity.username}</td>
                  <td>{identity.displayName}</td>
                  <td>{new Date(identity.createdAt).toLocaleDateString()}</td>
                  <td>{statusBadge(identity.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

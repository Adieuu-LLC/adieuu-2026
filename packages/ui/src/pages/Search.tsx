/**
 * Search page for finding identities.
 * Displays search results with filters and actions.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { deriveConversationId } from '@adieuu/crypto';
import { useIdentitySearch } from '../hooks/useIdentitySearch';
import { useIdentity } from '../hooks/useIdentity';
import { IdentityCard } from '../components/IdentityCard';
import { Input } from '../components/Input';
import { SearchIcon } from '../components/Icons';

export function Search() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { identity } = useIdentity();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  const [inputValue, setInputValue] = useState(initialQuery);
  const { results, isLoading, error, search, query } = useIdentitySearch({
    debounceMs: 300,
    limit: 50,
  });

  useEffect(() => {
    if (initialQuery) {
      search(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);
      search(value);

      if (value.trim()) {
        setSearchParams({ q: value.trim() }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    },
    [search, setSearchParams]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (inputValue.trim()) {
        search(inputValue);
        setSearchParams({ q: inputValue.trim() }, { replace: true });
      }
    },
    [inputValue, search, setSearchParams]
  );

  const handleMessage = useCallback((targetIdentity: { id: string; displayName: string }) => {
    if (!identity) return;
    const conversationId = deriveConversationId(identity.id, targetIdentity.id);
    // Pass recipient ID for new conversations where we don't have cache/list data yet
    navigate(`/conversation/${conversationId}?recipient=${targetIdentity.id}`);
  }, [identity, navigate]);

  return (
    <div className="page-content">
      <div className="container">
        <header className="page-header">
          <h1 className="page-title">{t('search.title')}</h1>
          <p className="page-subtitle">{t('search.subtitle')}</p>
        </header>

        <form onSubmit={handleSubmit} className="search-form">
          <Input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder={t('search.placeholder')}
            leftIcon={<SearchIcon />}
            inputSize="lg"
            autoFocus
          />
        </form>

        <div className="search-results">
          {isLoading && (
            <div className="search-loading">
              <div className="spinner spinner-lg" />
            </div>
          )}

          {error && (
            <div className="search-error">
              <p>{error}</p>
            </div>
          )}

          {!isLoading && !error && query.length >= 2 && results.length === 0 && (
            <div className="search-empty">
              <p>{t('search.noResults')}</p>
              <p className="search-empty-hint">{t('search.noResultsHint')}</p>
            </div>
          )}

          {!isLoading && results.length > 0 && (
            <>
              <p className="search-results-count">
                {t('search.resultsCount', { count: results.length })}
              </p>
              <div className="search-results-grid">
                {results.map((identity) => (
                  <IdentityCard
                    key={identity.id}
                    identity={identity}
                    showActions={true}
                    onMessage={handleMessage}
                  />
                ))}
              </div>
            </>
          )}

          {!query && (
            <div className="search-hint">
              <p>{t('search.hint')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

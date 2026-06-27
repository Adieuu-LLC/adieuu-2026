/**
 * Search page for finding identities.
 * Displays search results with filters and actions.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useIdentitySearch } from '../hooks/useIdentitySearch';
import { useIdentity } from '../hooks/useIdentity';
import { useFriends } from '../hooks/useFriends';
import { IdentityCard } from '../components/IdentityCard';
import { Input } from '../components/Input';
import { Icon } from '../icons/Icon';

export function Search() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const { identity, status: identityStatus } = useIdentity();
  const { sendRequest, getFriendshipStatus } = useFriends();
  const isIdentityLoggedIn = identityStatus === 'logged_in' && identity;

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
            leftIcon={<Icon name="search" />}
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
                {results.map((result) => (
                  <IdentityCard
                    key={result.id}
                    identity={result}
                    showFriendAction={!!isIdentityLoggedIn}
                    onSendFriendRequest={sendRequest}
                    onGetFriendshipStatus={getFriendshipStatus}
                    selfIdentityId={identity?.id}
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

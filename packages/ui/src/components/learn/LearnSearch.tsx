import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../Input';
import { searchLearnContent } from './searchLearnContent';
import type { LearnSearchIndexEntry, LearnSearchResult, LearnTabId } from './types';

export interface LearnSearchProps {
  index: LearnSearchIndexEntry[];
  onResultSelect: (result: {
    tabId: LearnTabId;
    categoryId: string;
    sectionId: string;
  }) => void;
}

export function LearnSearch({ index, onResultSelect }: LearnSearchProps) {
  const { t } = useTranslation();
  const resultsId = useId();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  const results = useMemo(
    () => searchLearnContent(index, debouncedQuery),
    [debouncedQuery, index],
  );

  const showResults = debouncedQuery.trim().length > 0;

  const handleSelect = (result: LearnSearchResult) => {
    setQuery('');
    setDebouncedQuery('');
    onResultSelect({
      tabId: result.tabId,
      categoryId: result.categoryId,
      sectionId: result.sectionId,
    });
  };

  return (
    <div className="learn-search">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('home.learn.search.placeholder')}
        aria-label={t('home.learn.search.label')}
        aria-controls={showResults ? resultsId : undefined}
        autoComplete="off"
      />

      {showResults && (
        <div id={resultsId} className="learn-search-results" role="listbox" aria-label={t('home.learn.search.resultsLabel')}>
          {results.length === 0 ? (
            <p className="learn-search-empty">{t('home.learn.search.noResults')}</p>
          ) : (
            results.map((result) => (
              <button
                key={`${result.tabId}-${result.hash}`}
                type="button"
                role="option"
                className="learn-search-result"
                onClick={() => handleSelect(result)}
              >
                <span className="learn-search-result-meta">
                  {t('home.learn.search.resultMeta', {
                    tab: result.tabLabel,
                    category: result.categoryLabel,
                  })}
                </span>
                <span className="learn-search-result-title">{result.title}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

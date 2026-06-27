import type { LearnSearchIndexEntry, LearnSearchResult } from './types';

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function searchLearnContent(
  index: LearnSearchIndexEntry[],
  query: string,
  maxResults = 20,
): LearnSearchResult[] {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  const results: LearnSearchResult[] = [];

  for (const entry of index) {
    const categoryLabel = entry.categoryLabel.toLowerCase();
    const title = entry.title.toLowerCase();
    const content = entry.content.toLowerCase();

    if (categoryLabel.includes(normalizedQuery)) {
      results.push({ ...entry, matchedField: 'category' });
      continue;
    }

    if (title.includes(normalizedQuery)) {
      results.push({ ...entry, matchedField: 'title' });
      continue;
    }

    if (content.includes(normalizedQuery)) {
      results.push({ ...entry, matchedField: 'content' });
    }
  }

  return results.slice(0, maxResults);
}

export type LearnSectionVariant = 'default' | 'jurisdictionCatalog';

export interface LearnSection {
  title: string;
  content: string;
  variant?: LearnSectionVariant;
}

export interface LearnCategory {
  label: string;
  sections: Record<string, LearnSection>;
}

export const LEARN_TAB_IDS = ['about', 'privacy', 'idVerification'] as const;

export type LearnTabId = (typeof LEARN_TAB_IDS)[number];

export const DEFAULT_LEARN_TAB: LearnTabId = 'about';

export interface LearnTabDefinition {
  id: LearnTabId;
  label: string;
  categories: Record<string, LearnCategory>;
}

export interface LearnSearchIndexEntry {
  tabId: LearnTabId;
  tabLabel: string;
  categoryId: string;
  categoryLabel: string;
  sectionId: string;
  title: string;
  content: string;
  hash: string;
}

export interface LearnSearchResult extends LearnSearchIndexEntry {
  matchedField: 'category' | 'title' | 'content';
}

export interface LearnHashTarget {
  tabId: LearnTabId;
  categoryId: string;
  sectionId?: string;
}

export type ExpandedByCategory = Record<string, string[]>;

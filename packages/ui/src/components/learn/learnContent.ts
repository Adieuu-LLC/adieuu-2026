import type { TFunction } from 'i18next';
import {
  DEFAULT_LEARN_TAB,
  LEARN_TAB_IDS,
  type LearnCategory,
  type LearnSearchIndexEntry,
  type LearnTabDefinition,
  type LearnTabId,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCategories(raw: unknown): Record<string, LearnCategory> {
  if (!isRecord(raw)) return {};

  const categories: Record<string, LearnCategory> = {};

  for (const [categoryId, categoryValue] of Object.entries(raw)) {
    if (!isRecord(categoryValue)) continue;

    const label = categoryValue.label;
    const sectionsRaw = categoryValue.sections;
    if (typeof label !== 'string' || !isRecord(sectionsRaw)) continue;

    const sections: LearnCategory['sections'] = {};

    for (const [sectionId, sectionValue] of Object.entries(sectionsRaw)) {
      if (!isRecord(sectionValue)) continue;

      const title = sectionValue.title;
      const content = sectionValue.content;
      if (typeof title !== 'string' || typeof content !== 'string') continue;

      const variantRaw = sectionValue.variant;
      const variant =
        variantRaw === 'jurisdictionCatalog' ? 'jurisdictionCatalog' : 'default';

      sections[sectionId] = { title, content, variant };
    }

    if (Object.keys(sections).length > 0) {
      categories[categoryId] = { label, sections };
    }
  }

  return categories;
}

export function loadLearnTabs(t: TFunction): LearnTabDefinition[] {
  return LEARN_TAB_IDS.flatMap((tabId) => {
    const label = t(`home.learn.tabs.${tabId}.label`);
    const categoriesRaw = t(`home.learn.tabs.${tabId}.categories`, { returnObjects: true });
    const categories = parseCategories(categoriesRaw);

    if (typeof label !== 'string' || Object.keys(categories).length === 0) {
      return [];
    }

    return [{ id: tabId, label, categories }];
  });
}

export function getLearnTabById(tabs: LearnTabDefinition[], tabId: LearnTabId): LearnTabDefinition | undefined {
  return tabs.find((tab) => tab.id === tabId);
}

export function buildLearnSearchIndex(tabs: LearnTabDefinition[]): LearnSearchIndexEntry[] {
  const entries: LearnSearchIndexEntry[] = [];

  for (const tab of tabs) {
    for (const [categoryId, category] of Object.entries(tab.categories)) {
      for (const [sectionId, section] of Object.entries(category.sections)) {
        entries.push({
          tabId: tab.id,
          tabLabel: tab.label,
          categoryId,
          categoryLabel: category.label,
          sectionId,
          title: section.title,
          content: section.content,
          hash: `${categoryId}-${sectionId}`,
        });
      }
    }
  }

  return entries;
}

export function parseLearnHash(hash: string): { categoryId: string; sectionId?: string } | null {
  const id = hash.replace(/^#/, '').trim();
  if (!id) return null;

  const dashIndex = id.indexOf('-');
  if (dashIndex === -1) {
    return { categoryId: id };
  }

  return {
    categoryId: id.slice(0, dashIndex),
    sectionId: id.slice(dashIndex + 1),
  };
}

export function inferTabIdFromHash(
  hash: string,
  tabs: LearnTabDefinition[],
  fallback: LearnTabId = DEFAULT_LEARN_TAB,
): LearnTabId {
  const parsed = parseLearnHash(hash);
  if (!parsed) return fallback;

  for (const tab of tabs) {
    const category = tab.categories[parsed.categoryId];
    if (!category) continue;

    if (parsed.sectionId && !category.sections[parsed.sectionId]) continue;

    return tab.id;
  }

  return fallback;
}

export function resolveLearnHashTarget(
  hash: string,
  tabs: LearnTabDefinition[],
  explicitTabId?: LearnTabId | null,
): { tabId: LearnTabId; categoryId: string; sectionId?: string } | null {
  const parsed = parseLearnHash(hash);
  if (!parsed) return null;

  const tabId = explicitTabId ?? inferTabIdFromHash(hash, tabs);
  const tab = getLearnTabById(tabs, tabId);
  if (!tab) return null;

  const category = tab.categories[parsed.categoryId];
  if (!category) return null;

  if (parsed.sectionId && !category.sections[parsed.sectionId]) {
    return null;
  }

  return {
    tabId,
    categoryId: parsed.categoryId,
    sectionId: parsed.sectionId,
  };
}

export function isLearnTabId(value: string | null | undefined): value is LearnTabId {
  return LEARN_TAB_IDS.includes(value as LearnTabId);
}

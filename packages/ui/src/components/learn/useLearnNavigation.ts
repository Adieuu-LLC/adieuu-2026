import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '../../config';
import { useToast } from '../Toast';
import {
  buildLearnSearchIndex,
  inferTabIdFromHash,
  isLearnTabId,
  loadLearnTabs,
  resolveLearnHashTarget,
} from './learnContent';
import {
  DEFAULT_LEARN_TAB,
  type ExpandedByCategory,
  type LearnSearchIndexEntry,
  type LearnTabDefinition,
  type LearnTabId,
} from './types';

function buildExpandedState(
  categoryId: string,
  sectionId?: string,
  current: ExpandedByCategory = {},
): ExpandedByCategory {
  if (!sectionId) return current;

  const existing = current[categoryId] ?? [];
  if (existing.includes(sectionId)) return current;

  return {
    ...current,
    [categoryId]: [...existing, sectionId],
  };
}

function scrollToElement(id: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

export interface UseLearnNavigationResult {
  tabs: LearnTabDefinition[];
  activeTab: LearnTabId;
  setActiveTab: (tabId: LearnTabId) => void;
  activeTabDefinition: LearnTabDefinition | undefined;
  expandedByCategory: ExpandedByCategory;
  setExpandedByCategory: Dispatch<SetStateAction<ExpandedByCategory>>;
  navigateToTarget: (target: {
    tabId: LearnTabId;
    categoryId: string;
    sectionId?: string;
  }) => void;
  copyPermalink: (hash: string, tabId?: LearnTabId) => Promise<void>;
  searchIndex: LearnSearchIndexEntry[];
}

export function useLearnNavigation(): UseLearnNavigationResult {
  const { t } = useTranslation();
  const toast = useToast();
  const { externalLinkBase } = useAppConfig();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = useMemo(() => loadLearnTabs(t), [t]);
  const searchIndex = useMemo(() => buildLearnSearchIndex(tabs), [tabs]);

  const tabFromQuery = searchParams.get('tab');
  const initialTab = isLearnTabId(tabFromQuery) ? tabFromQuery : DEFAULT_LEARN_TAB;
  const initialHashTab = location.hash ? inferTabIdFromHash(location.hash, tabs, initialTab) : initialTab;

  const [activeTab, setActiveTabState] = useState<LearnTabId>(initialHashTab);
  const [expandedByCategory, setExpandedByCategory] = useState<ExpandedByCategory>({});
  const pendingNavigationRef = useRef<{ tabId: LearnTabId; hash: string } | null>(null);
  const handledHashRef = useRef<string | null>(null);

  const activeTabDefinition = useMemo(
    () => tabs.find((tab) => tab.id === activeTab),
    [tabs, activeTab],
  );

  const applyHashTarget = useCallback(
    (hash: string, explicitTabId?: LearnTabId | null) => {
      const target = resolveLearnHashTarget(hash, tabs, explicitTabId);
      if (!target) return;

      setActiveTabState(target.tabId);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('tab', target.tabId);
          return next;
        },
        { replace: true },
      );

      if (target.sectionId) {
        setExpandedByCategory((current) =>
          buildExpandedState(target.categoryId, target.sectionId, current),
        );
        scrollToElement(`${target.categoryId}-${target.sectionId}`);
      } else {
        scrollToElement(target.categoryId);
      }

      history.replaceState(null, '', `${location.pathname}?tab=${target.tabId}#${target.categoryId}${target.sectionId ? `-${target.sectionId}` : ''}`);
    },
    [location.pathname, setSearchParams, tabs],
  );

  const setActiveTab = useCallback(
    (tabId: LearnTabId) => {
      setActiveTabState(tabId);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('tab', tabId);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const navigateToTarget = useCallback(
    (target: { tabId: LearnTabId; categoryId: string; sectionId?: string }) => {
      const hash = target.sectionId
        ? `${target.categoryId}-${target.sectionId}`
        : target.categoryId;

      pendingNavigationRef.current = { tabId: target.tabId, hash };
      setActiveTabState(target.tabId);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('tab', target.tabId);
          return next;
        },
        { replace: true },
      );

      if (target.sectionId) {
        setExpandedByCategory((current) =>
          buildExpandedState(target.categoryId, target.sectionId, current),
        );
      }

      history.replaceState(null, '', `${location.pathname}?tab=${target.tabId}#${hash}`);
    },
    [location.pathname, setSearchParams],
  );

  useEffect(() => {
    if (!pendingNavigationRef.current) return;

    const pending = pendingNavigationRef.current;
    if (pending.tabId !== activeTab) return;

    pendingNavigationRef.current = null;
    applyHashTarget(`#${pending.hash}`, pending.tabId);
  }, [activeTab, applyHashTarget]);

  useEffect(() => {
    if (!location.hash || handledHashRef.current === location.hash) return;

    handledHashRef.current = location.hash;
    applyHashTarget(location.hash, isLearnTabId(tabFromQuery) ? tabFromQuery : null);
  }, [applyHashTarget, location.hash, tabFromQuery]);

  useEffect(() => {
    if (location.hash) return;
    if (isLearnTabId(tabFromQuery) && tabFromQuery !== activeTab) {
      setActiveTabState(tabFromQuery);
    }
  }, [activeTab, location.hash, tabFromQuery]);

  const copyPermalink = useCallback(
    async (hash: string, tabId: LearnTabId = activeTab) => {
      const base = externalLinkBase || window.location.origin;
      const normalizedHash = hash.replace(/^#/, '');
      const tabQuery = tabId === DEFAULT_LEARN_TAB ? '' : `?tab=${tabId}`;
      const url = `${base}${location.pathname}${tabQuery}#${normalizedHash}`;

      try {
        await navigator.clipboard.writeText(url);
        toast.success(t('home.learn.linkCopied'));
      } catch {
        // Silently fail if clipboard API is unavailable
      }
    },
    [activeTab, externalLinkBase, location.pathname, t, toast],
  );

  return {
    tabs,
    activeTab,
    setActiveTab,
    activeTabDefinition,
    expandedByCategory,
    setExpandedByCategory,
    navigateToTarget,
    copyPermalink,
    searchIndex,
  };
}

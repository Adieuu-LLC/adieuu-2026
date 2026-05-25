import { useCallback } from 'react';
import { Tabs, TabList, TabTrigger, TabContent } from './Tabs';
import { LearnSearch } from './learn/LearnSearch';
import { LearnTabPanel } from './learn/LearnTabPanel';
import { isLearnTabId } from './learn/learnContent';
import { useLearnNavigation } from './learn/useLearnNavigation';
import type { LearnTabId } from './learn/types';

export function LearnContent() {
  const {
    tabs,
    activeTab,
    setActiveTab,
    expandedByCategory,
    setExpandedByCategory,
    navigateToTarget,
    copyPermalink,
    searchIndex,
  } = useLearnNavigation();

  const handleExpandedChange = useCallback(
    (categoryId: string, value: string[]) => {
      setExpandedByCategory((current) => ({
        ...current,
        [categoryId]: value,
      }));
    },
    [setExpandedByCategory],
  );

  const handleCopyPermalink = useCallback(
    (hash: string) => copyPermalink(hash, activeTab),
    [activeTab, copyPermalink],
  );

  const handleSearchResult = useCallback(
    (result: { tabId: LearnTabId; categoryId: string; sectionId: string }) => {
      navigateToTarget(result);
    },
    [navigateToTarget],
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      if (isLearnTabId(tab)) {
        setActiveTab(tab);
      }
    },
    [setActiveTab],
  );

  if (tabs.length === 0) return null;

  return (
    <>
      <LearnSearch index={searchIndex} onResultSelect={handleSearchResult} />

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="learn-tabs"
      >
        <TabList>
          {tabs.map((tab) => (
            <TabTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabTrigger>
          ))}
        </TabList>

        {tabs.map((tab) => (
          <TabContent key={tab.id} value={tab.id}>
            <LearnTabPanel
              tabId={tab.id}
              categories={tab.categories}
              expandedByCategory={expandedByCategory}
              onExpandedChange={handleExpandedChange}
              onCopyPermalink={handleCopyPermalink}
            />
          </TabContent>
        ))}
      </Tabs>
    </>
  );
}

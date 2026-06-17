/**
 * Profile body tabs shared between public profile view and profile editor preview.
 */

import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabList, TabTrigger, TabContent, type TabItem } from './Tabs';

export interface ProfileContentTabsProps {
  achievements: ReactNode;
  className?: string;
  /** Pill-style background behind tab labels for readability on custom profile backgrounds. */
  tabsChrome?: boolean;
}

export function ProfileContentTabs({
  achievements,
  className = '',
  tabsChrome = false,
}: ProfileContentTabsProps) {
  const { t } = useTranslation();

  const profileTabItems = useMemo<TabItem[]>(
    () => [
      { value: 'posts', label: t('identity.profileView.tabPosts') },
      { value: 'spaces', label: t('identity.profileView.tabSpaces') },
      { value: 'achievements', label: t('identity.profileView.tabAchievements') },
      { value: 'reports', label: t('identity.profileView.tabReports') },
    ],
    [t],
  );

  const tabList = (
    <TabList className="profile-view-tabs-list" mobileItems={profileTabItems}>
      {profileTabItems.map((tab) => (
        <TabTrigger key={tab.value} value={tab.value}>
          {tab.label}
        </TabTrigger>
      ))}
    </TabList>
  );

  return (
    <div className={['profile-view-content', className].filter(Boolean).join(' ')}>
      <Tabs defaultTab="achievements" className="profile-view-tabs">
        {tabsChrome ? (
          <div className="profile-view-tabs-chrome">{tabList}</div>
        ) : (
          tabList
        )}

        <TabContent value="posts" className="profile-view-tab-panel">
          <p className="profile-view-tab-placeholder">
            {t('identity.profileView.postsPlaceholder')}
          </p>
        </TabContent>

        <TabContent value="spaces" className="profile-view-tab-panel">
          <p className="profile-view-tab-placeholder">
            {t('identity.profileView.spacesPlaceholder')}
          </p>
        </TabContent>

        <TabContent value="achievements" className="profile-view-tab-panel">
          {achievements}
        </TabContent>

        <TabContent value="reports" className="profile-view-tab-panel">
          <p className="profile-view-tab-placeholder">
            {t('identity.profileView.reportsPlaceholder')}
          </p>
        </TabContent>
      </Tabs>
    </div>
  );
}

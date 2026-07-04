/**
 * Horizontal tab bar for sidebar content sections.
 * Displays icon-only tabs with tooltips.
 */

import type { ReactNode } from 'react';
import { Tooltip } from './Tooltip';
import { useSidebar } from './Sidebar';

export interface SidebarTab {
  /** Unique tab identifier */
  id: string;
  /** Icon element to display */
  icon: ReactNode;
  /** Tooltip label */
  label: string;
  /** Optional badge count shown as a pill; renders when > 0 */
  badge?: number;
}

export interface SidebarTabsProps {
  /** Available tabs */
  tabs: SidebarTab[];
  /** Currently active tab ID */
  activeTab: string;
  /** Callback when a tab is selected */
  onTabChange: (tabId: string) => void;
}

/**
 * Horizontal tab bar for switching between sidebar content sections.
 * Each tab displays an icon with a tooltip showing the label.
 */
export function SidebarTabs({ tabs, activeTab, onTabChange }: SidebarTabsProps) {
  const { isExpanded } = useSidebar();

  return (
    <div className={`sidebar-tabs ${!isExpanded ? 'sidebar-tabs-collapsed' : ''}`} data-tour="sidebar-tabs">
      {tabs.map((tab) => (
        <Tooltip key={tab.id} content={tab.label} position="bottom">
          <button
            type="button"
            className={`sidebar-tab ${activeTab === tab.id ? 'sidebar-tab-active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            aria-label={tab.label}
            aria-pressed={activeTab === tab.id}
          >
            <span className="sidebar-tab-icon">
              {tab.icon}
              {tab.badge != null && tab.badge > 0 && (
                <span className="sidebar-tab-badge" role="status" aria-label={`${tab.badge} new`}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </span>
            {isExpanded && <span className="sidebar-tab-label">{tab.label}</span>}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

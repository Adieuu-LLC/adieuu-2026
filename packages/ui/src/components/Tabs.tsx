import { useState, createContext, useContext, ReactNode } from 'react';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider');
  }
  return context;
}

interface TabsProps {
  /** Default tab for uncontrolled mode */
  defaultTab?: string;
  /** Controlled tab value */
  value?: string;
  /** Callback when tab changes (for controlled mode or side effects) */
  onValueChange?: (tab: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ defaultTab, value, onValueChange, children, className = '' }: TabsProps) {
  // Support both controlled and uncontrolled modes
  const [internalTab, setInternalTab] = useState(defaultTab ?? '');
  
  const activeTab = value !== undefined ? value : internalTab;
  
  const setActiveTab = (tab: string) => {
    if (value === undefined) {
      // Uncontrolled mode - update internal state
      setInternalTab(tab);
    }
    // Always call onValueChange if provided
    onValueChange?.(tab);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={`tabs ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabListProps {
  children: ReactNode;
  className?: string;
}

export function TabList({ children, className = '' }: TabListProps) {
  return (
    <div className={`tabs-list ${className}`} role="tablist">
      {children}
    </div>
  );
}

interface TabTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabTrigger({ value, children, className = '' }: TabTriggerProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={`tabs-trigger ${isActive ? 'tabs-trigger-active' : ''} ${className}`}
      onClick={() => setActiveTab(value)}
    >
      {children}
    </button>
  );
}

interface TabContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabContent({ value, children, className = '' }: TabContentProps) {
  const { activeTab } = useTabsContext();

  if (activeTab !== value) {
    return null;
  }

  return (
    <div role="tabpanel" className={`tabs-content ${className}`}>
      {children}
    </div>
  );
}

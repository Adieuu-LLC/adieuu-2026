import { useState, createContext, useContext, useMemo, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import { Icon } from '../icons/Icon';

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
  const [internalTab, setInternalTab] = useState(defaultTab ?? '');
  
  const activeTab = value !== undefined ? value : internalTab;
  
  const setActiveTab = (tab: string) => {
    if (value === undefined) {
      setInternalTab(tab);
    }
    onValueChange?.(tab);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={`tabs ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
}

export interface TabItem {
  value: string;
  label: string;
}

interface TabListProps {
  children: ReactNode;
  className?: string;
  /** When provided, renders a mobile-friendly Select dropdown alongside the tab buttons. */
  mobileItems?: TabItem[];
}

export function TabList({ children, className = '', mobileItems }: TabListProps) {
  const { activeTab, setActiveTab } = useTabsContext();

  const collection = useMemo(
    () => mobileItems
      ? createListCollection({ items: mobileItems.map((item) => ({ value: item.value, label: item.label })) })
      : null,
    [mobileItems],
  );

  const activeLabel = mobileItems?.find((item) => item.value === activeTab)?.label ?? '';

  return (
    <>
      <div className={`tabs-list ${className}`} role="tablist">
        {children}
      </div>

      {collection && mobileItems && (
        <div className="tabs-mobile-select-wrapper">
          <Select.Root
            collection={collection}
            value={[activeTab]}
            onValueChange={(details) => {
              const next = details.value[0];
              if (next) setActiveTab(next);
            }}
            positioning={{ sameWidth: true }}
          >
            <Select.Control className="tabs-mobile-select-control">
              <Select.Trigger className="tabs-mobile-select-trigger">
                <Select.ValueText>{activeLabel}</Select.ValueText>
                <Select.Indicator className="tabs-mobile-select-indicator">
                  <Icon name="chevronDown" size="xs" />
                </Select.Indicator>
              </Select.Trigger>
            </Select.Control>

            <Portal>
              <Select.Positioner>
                <Select.Content className="tabs-mobile-select-content">
                  {collection.items.map((item) => (
                    <Select.Item
                      key={item.value}
                      item={item}
                      className="tabs-mobile-select-item"
                    >
                      <Select.ItemText>{item.label}</Select.ItemText>
                      <Select.ItemIndicator className="tabs-mobile-select-check">
                        <Icon name="check" size="xs" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>
        </div>
      )}
    </>
  );
}

interface TabTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'role' | 'onClick'> {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabTrigger({ value, children, className = '', ...rest }: TabTriggerProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={`tabs-trigger ${isActive ? 'tabs-trigger-active' : ''} ${className}`}
      onClick={() => setActiveTab(value)}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface TabContentProps {
  value: string;
  children?: ReactNode;
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

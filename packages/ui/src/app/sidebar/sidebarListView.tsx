/**
 * Primary sidebar list view: Conversations, Spaces, or All.
 * Shared so the folder panel can mute out-of-view members.
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type SidebarListView = 'conversations' | 'spaces' | 'all';

export function isConversationMutedInView(view: SidebarListView): boolean {
  return view === 'spaces';
}

export function isSpaceMutedInView(view: SidebarListView): boolean {
  return view === 'conversations';
}

export function showConversationsInList(view: SidebarListView): boolean {
  return view === 'conversations' || view === 'all';
}

export function showSpacesInList(view: SidebarListView): boolean {
  return view === 'spaces' || view === 'all';
}

interface SidebarListViewContextValue {
  listView: SidebarListView;
  setListView: (view: SidebarListView) => void;
}

const SidebarListViewContext = createContext<SidebarListViewContextValue | null>(null);

export function SidebarListViewProvider({ children }: { children: ReactNode }) {
  const [listView, setListView] = useState<SidebarListView>('all');
  const value = useMemo(() => ({ listView, setListView }), [listView]);
  return (
    <SidebarListViewContext.Provider value={value}>
      {children}
    </SidebarListViewContext.Provider>
  );
}

export function useSidebarListView(): SidebarListViewContextValue {
  const ctx = useContext(SidebarListViewContext);
  if (!ctx) {
    throw new Error('useSidebarListView must be used within a SidebarListViewProvider');
  }
  return ctx;
}

/** Safe read for panels that may mount outside the provider (public shell). */
export function useSidebarListViewOptional(): SidebarListViewContextValue | null {
  return useContext(SidebarListViewContext);
}

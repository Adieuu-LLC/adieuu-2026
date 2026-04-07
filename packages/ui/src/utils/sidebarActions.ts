/**
 * Module-level event emitter for programmatically opening sidebar panels.
 *
 * Because `ConversationsProvider` and `FriendsProvider` are ancestors of
 * `AppSidebar` in the component tree, a React context cannot communicate
 * upward from child to ancestor.  This lightweight emitter sidesteps the
 * tree-ordering constraint entirely: any code can call `openFriends()` /
 * `openInvites()`, and `AppSidebar` subscribes to react accordingly.
 */

export type SidebarAction = 'openFriends' | 'openInvites';

const listeners = new Set<(action: SidebarAction) => void>();

export const sidebarActions = {
  subscribe(fn: (action: SidebarAction) => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  openFriends(): void {
    listeners.forEach((fn) => fn('openFriends'));
  },
  openInvites(): void {
    listeners.forEach((fn) => fn('openInvites'));
  },
};

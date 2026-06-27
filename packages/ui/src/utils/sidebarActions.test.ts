import { beforeEach, describe, expect, test } from 'bun:test';
import { sidebarActions, type SidebarAction } from './sidebarActions';

describe('sidebarActions', () => {
  let unsubs: Array<() => void> = [];

  beforeEach(() => {
    for (const unsub of unsubs) unsub();
    unsubs = [];
  });

  test('subscribed listeners receive openFriends action', () => {
    const events: SidebarAction[] = [];
    const unsubscribe = sidebarActions.subscribe((action) => {
      events.push(action);
    });
    unsubs.push(unsubscribe);

    sidebarActions.openFriends();

    expect(events).toEqual(['openFriends']);
  });

  test('subscribed listeners receive openInvites action', () => {
    const events: SidebarAction[] = [];
    const unsubscribe = sidebarActions.subscribe((action) => {
      events.push(action);
    });
    unsubs.push(unsubscribe);

    sidebarActions.openInvites();

    expect(events).toEqual(['openInvites']);
  });

  test('unsubscribe removes listener', () => {
    const events: SidebarAction[] = [];
    const unsubscribe = sidebarActions.subscribe((action) => {
      events.push(action);
    });

    unsubscribe();
    sidebarActions.openFriends();

    expect(events).toEqual([]);
  });

  test('listeners are called in subscription order', () => {
    const events: string[] = [];
    const unsubscribeFirst = sidebarActions.subscribe((action) => {
      events.push(`first:${action}`);
    });
    const unsubscribeSecond = sidebarActions.subscribe((action) => {
      events.push(`second:${action}`);
    });
    unsubs.push(unsubscribeFirst, unsubscribeSecond);

    sidebarActions.openInvites();

    expect(events).toEqual(['first:openInvites', 'second:openInvites']);
  });
});

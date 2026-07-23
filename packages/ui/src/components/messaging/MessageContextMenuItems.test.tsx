import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { createElement } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { MessageContextMenuItemsProps } from './MessageContextMenuItems';

mock.module('@ark-ui/react', () => ({
  Menu: {
    Item: ({ value, children, disabled, title, className }: {
      value: string; children: React.ReactNode; disabled?: boolean; title?: string; className?: string;
    }) => createElement('div', { 'data-value': value, 'data-disabled': disabled, title, className }, children),
  },
}));

mock.module('../../icons/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

const { MessageContextMenuItems } = await import('./MessageContextMenuItems');

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: GlobalWindow;
let root: Root | null = null;
let container: ReturnType<typeof happy.document.createElement>;

beforeEach(() => {
  happy = new GlobalWindow({ url: 'http://localhost' });
  const g = globalThis as G;
  g.window = happy as unknown as typeof g.window;
  g.document = happy.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  const g = globalThis as G;
  delete g.window;
  delete g.document;
  delete g.IS_REACT_ACT_ENVIRONMENT;
});

function renderItems(overrides: Partial<MessageContextMenuItemsProps> = {}) {
  const props: MessageContextMenuItemsProps = {
    isOwn: false,
    isDeleted: false,
    canShowEditControl: false,
    canStartEdit: false,
    editMaxedReason: 'Max edits reached',
    canManagePin: false,
    isPinned: false,
    hasReply: false,
    ...overrides,
  };
  act(() => {
    root = createRoot(container as unknown as HTMLElement);
    root.render(createElement(MessageContextMenuItems, props));
  });
  return container;
}

function getItems(c: typeof container): string[] {
  const divs = (c as unknown as HTMLElement).querySelectorAll('[data-value]');
  return Array.from(divs).map((d) => d.getAttribute('data-value')!);
}

describe('MessageContextMenuItems', () => {
  it('always renders react and delete-for-me items', () => {
    const c = renderItems();
    const values = getItems(c);
    expect(values).toContain('react');
    expect(values).toContain('delete-for-me');
  });

  it('renders reply item when hasReply and not deleted', () => {
    const c = renderItems({ hasReply: true });
    expect(getItems(c)).toContain('reply');
  });

  it('does not render reply when message is deleted', () => {
    const c = renderItems({ hasReply: true, isDeleted: true });
    expect(getItems(c)).not.toContain('reply');
  });

  it('does not render reply when hasReply is false', () => {
    const c = renderItems({ hasReply: false });
    expect(getItems(c)).not.toContain('reply');
  });

  it('renders edit item when canShowEditControl is true', () => {
    const c = renderItems({ canShowEditControl: true, canStartEdit: true });
    expect(getItems(c)).toContain('edit');
  });

  it('renders disabled edit item when canStartEdit is false', () => {
    const c = renderItems({ canShowEditControl: true, canStartEdit: false });
    expect(getItems(c)).toContain('edit');
    const editEl = (c as unknown as HTMLElement).querySelector('[data-value="edit"]');
    expect(editEl?.getAttribute('data-disabled')).toBe('true');
    expect(editEl?.getAttribute('title')).toBe('Max edits reached');
  });

  it('does not render edit item when canShowEditControl is false', () => {
    const c = renderItems({ canShowEditControl: false });
    expect(getItems(c)).not.toContain('edit');
  });

  it('renders pin item when canManagePin and not pinned', () => {
    const c = renderItems({ canManagePin: true, isPinned: false });
    expect(getItems(c)).toContain('pin');
    expect(getItems(c)).not.toContain('unpin');
  });

  it('renders unpin item when canManagePin and already pinned', () => {
    const c = renderItems({ canManagePin: true, isPinned: true });
    expect(getItems(c)).toContain('unpin');
    expect(getItems(c)).not.toContain('pin');
  });

  it('does not render pin/unpin when canManagePin is false', () => {
    const c = renderItems({ canManagePin: false });
    expect(getItems(c)).not.toContain('pin');
    expect(getItems(c)).not.toContain('unpin');
  });

  it('does not render pin when message is deleted', () => {
    const c = renderItems({ canManagePin: true, isDeleted: true });
    expect(getItems(c)).not.toContain('pin');
    expect(getItems(c)).not.toContain('unpin');
  });

  it('renders report item for non-own, non-deleted messages', () => {
    const c = renderItems({ isOwn: false, isDeleted: false });
    expect(getItems(c)).toContain('report');
  });

  it('does not render report for own messages', () => {
    const c = renderItems({ isOwn: true });
    expect(getItems(c)).not.toContain('report');
  });

  it('does not render report for deleted messages', () => {
    const c = renderItems({ isOwn: false, isDeleted: true });
    expect(getItems(c)).not.toContain('report');
  });

  it('renders delete-for-everyone only for own messages', () => {
    const own = renderItems({ isOwn: true });
    expect(getItems(own)).toContain('delete-for-everyone');

    if (root) { act(() => root!.unmount()); root = null; }
    const other = renderItems({ isOwn: false });
    expect(getItems(other)).not.toContain('delete-for-everyone');
  });

  it('delete-for-everyone has danger class', () => {
    const c = renderItems({ isOwn: true });
    const el = (c as unknown as HTMLElement).querySelector('[data-value="delete-for-everyone"]');
    expect(el?.getAttribute('class')).toContain('dm-context-menu-item--danger');
  });
});

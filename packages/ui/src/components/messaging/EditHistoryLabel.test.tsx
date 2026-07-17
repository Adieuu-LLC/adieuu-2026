import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { createElement } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { EditHistoryLabel, type EditHistoryLabelProps } from './EditHistoryLabel';

mock.module('@ark-ui/react', () => ({
  Popover: {
    Root: ({ children }: { children: React.ReactNode }) => createElement('div', { 'data-testid': 'popover-root' }, children),
    Trigger: ({ children }: { children: React.ReactNode }) => createElement('div', { 'data-testid': 'popover-trigger' }, children),
    Content: ({ children, className }: { children: React.ReactNode; className?: string }) =>
      createElement('div', { 'data-testid': 'popover-content', className }, children),
    Positioner: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  },
  Portal: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}));

mock.module('../../services/messagePayload', () => ({
  parsePayload: (text: string) => ({ text, gifAttachments: [], mentions: [], pageTags: [], isStructured: false }),
}));

mock.module('../../pages/conversations/conversationUtils', () => ({
  formatAbsoluteTime: (ts: string) => `abs:${ts}`,
}));

mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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

function render(props: Partial<EditHistoryLabelProps> = {}) {
  const allProps: EditHistoryLabelProps = {
    loadHistory: async () => [],
    ...props,
  };
  act(() => {
    root = createRoot(container as unknown as HTMLElement);
    root.render(createElement(EditHistoryLabel, allProps));
  });
  return container;
}

describe('EditHistoryLabel', () => {
  it('renders the "Edited" button', () => {
    const c = render();
    expect(c.innerHTML).toContain('conversations.messageEdited');
  });

  it('applies className to the trigger button', () => {
    const c = render({ className: 'my-custom-class' });
    expect(c.innerHTML).toContain('my-custom-class');
  });

  it('shows lastEditedAt in the title attribute', () => {
    const c = render({ lastEditedAt: '2024-06-15T12:00:00Z' });
    expect(c.innerHTML).toContain('abs:2024-06-15T12:00:00Z');
  });

  it('shows viewEditHistory when lastEditedAt is absent', () => {
    const c = render({ lastEditedAt: undefined });
    expect(c.innerHTML).toContain('conversations.viewEditHistory');
  });
});

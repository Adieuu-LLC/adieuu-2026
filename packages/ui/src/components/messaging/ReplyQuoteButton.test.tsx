import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { createElement } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { ReplyQuoteButton } from './ReplyQuoteButton';

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

function render(props: Parameters<typeof ReplyQuoteButton>[0]) {
  act(() => {
    root = createRoot(container as unknown as HTMLElement);
    root.render(createElement(ReplyQuoteButton, props));
  });
  return container;
}

describe('ReplyQuoteButton', () => {
  it('renders snippet text', () => {
    const c = render({ replyQuote: { text: 'hello world', onQuoteClick: () => {} } });
    expect(c.innerHTML).toContain('hello world');
    expect(c.innerHTML).toContain('dm-message-reply-quote-snippet');
  });

  it('renders author name and avatar when quotedAuthor is provided', () => {
    const c = render({
      replyQuote: {
        text: 'reply text',
        onQuoteClick: () => {},
        quotedAuthor: { displayName: 'Alice', avatarUrl: 'https://img.test/alice.png' },
      },
    });
    expect(c.innerHTML).toContain('Alice');
    expect(c.innerHTML).toContain('dm-message-reply-quote-author');
    expect(c.innerHTML).toContain('https://img.test/alice.png');
    expect(c.innerHTML).toContain('dm-message-reply-quote-avatar-img');
  });

  it('renders placeholder initial when quotedAuthor has no avatarUrl', () => {
    const c = render({
      replyQuote: {
        text: 'reply text',
        onQuoteClick: () => {},
        quotedAuthor: { displayName: 'Bob' },
      },
    });
    expect(c.innerHTML).toContain('dm-message-reply-quote-avatar-placeholder');
    expect(c.innerHTML).toContain('B');
    expect(c.innerHTML).not.toContain('dm-message-reply-quote-avatar-img');
  });

  it('does not render author section when quotedAuthor is absent', () => {
    const c = render({ replyQuote: { text: 'no author', onQuoteClick: () => {} } });
    expect(c.innerHTML).not.toContain('dm-message-reply-quote-author');
    expect(c.innerHTML).not.toContain('dm-message-reply-quote-avatar');
  });

  it('calls onQuoteClick when clicked', () => {
    const onClick = mock(() => {});
    const c = render({ replyQuote: { text: 'click me', onQuoteClick: onClick } });
    const btn = (c as unknown as HTMLElement).querySelector('button');
    act(() => {
      btn?.dispatchEvent(new (happy.window as unknown as typeof globalThis).Event('click', { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sets combined aria-label when author is present', () => {
    const c = render({
      replyQuote: {
        text: 'some text',
        onQuoteClick: () => {},
        quotedAuthor: { displayName: 'Carol' },
      },
    });
    const btn = (c as unknown as HTMLElement).querySelector('button');
    expect(btn?.getAttribute('aria-label')).toBe('Carol: some text');
  });

  it('sets text-only aria-label when no author', () => {
    const c = render({ replyQuote: { text: 'just text', onQuoteClick: () => {} } });
    const btn = (c as unknown as HTMLElement).querySelector('button');
    expect(btn?.getAttribute('aria-label')).toBe('just text');
  });
});

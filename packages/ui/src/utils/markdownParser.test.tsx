import { describe, expect, mock, test } from 'bun:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PublicIdentity, CustomEmojiPayloadEntry } from '@adieuu/shared';
import type { MentionRenderContext, HiddenEmbedInfo } from './markdownParser';

mock.module('../components/IdentityHoverCard', () => ({
  IdentityHoverCard: ({ children }: { children: ReactElement }) => children,
}));

mock.module('../components/Tooltip', () => ({
  Tooltip: ({ children, content }: { children: ReactElement; content: string }) => (
    <span data-tooltip={content}>{children}</span>
  ),
}));

mock.module('../icons/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

const { injectMentionMarkers, renderFormattedMessage } = await import('./markdownParser');

const ID_A = 'aaa111222333444555666777';
const ID_B = 'bbb111222333444555666777';

// ---------------------------------------------------------------------------
// injectMentionMarkers
// ---------------------------------------------------------------------------

describe('injectMentionMarkers', () => {
  test('returns text unchanged when mentions array is empty', () => {
    expect(injectMentionMarkers('hello', [])).toBe('hello');
  });

  test('replaces a single mention at the start', () => {
    const result = injectMentionMarkers('@Alice hello', [
      { id: ID_A, offset: 0, length: 6 },
    ]);
    expect(result).toBe(`\uFFF0${ID_A}\uFFF1 hello`);
  });

  test('replaces a single mention in the middle', () => {
    const result = injectMentionMarkers('Hey @Alice check this', [
      { id: ID_A, offset: 4, length: 6 },
    ]);
    expect(result).toBe(`Hey \uFFF0${ID_A}\uFFF1 check this`);
  });

  test('replaces a mention at the end', () => {
    const result = injectMentionMarkers('Hello @Bob', [
      { id: ID_B, offset: 6, length: 4 },
    ]);
    expect(result).toBe(`Hello \uFFF0${ID_B}\uFFF1`);
  });

  test('replaces multiple mentions preserving order', () => {
    const result = injectMentionMarkers('Hey @Alice and @Bob!', [
      { id: ID_A, offset: 4, length: 6 },
      { id: ID_B, offset: 15, length: 4 },
    ]);
    expect(result).toBe(`Hey \uFFF0${ID_A}\uFFF1 and \uFFF0${ID_B}\uFFF1!`);
  });

  test('handles adjacent mentions', () => {
    const result = injectMentionMarkers('@A@B', [
      { id: ID_A, offset: 0, length: 2 },
      { id: ID_B, offset: 2, length: 2 },
    ]);
    expect(result).toBe(`\uFFF0${ID_A}\uFFF1\uFFF0${ID_B}\uFFF1`);
  });

  test('skips mentions with out-of-bounds offsets', () => {
    const result = injectMentionMarkers('Hi', [
      { id: ID_A, offset: 10, length: 6 },
    ]);
    expect(result).toBe('Hi');
  });

  test('skips mentions with negative offsets', () => {
    const result = injectMentionMarkers('Hi', [
      { id: ID_A, offset: -1, length: 2 },
    ]);
    expect(result).toBe('Hi');
  });

  test('skips mentions where offset+length exceeds text length', () => {
    const result = injectMentionMarkers('Hi @A', [
      { id: ID_A, offset: 3, length: 10 },
    ]);
    expect(result).toBe('Hi @A');
  });
});

// ---------------------------------------------------------------------------
// renderFormattedMessage with mentions
// ---------------------------------------------------------------------------

const noop = () => {};

function renderToHtml(text: string, mentionCtx?: Parameters<typeof renderFormattedMessage>[2]) {
  const node = renderFormattedMessage(text, noop, mentionCtx);
  return node ? renderToStaticMarkup(node as ReactElement) : '';
}

const mentionCtx: MentionRenderContext = {
  profiles: {
    [ID_A]: {
      id: ID_A,
      username: 'alice',
      displayName: 'Alice',
    } as PublicIdentity,
    [ID_B]: {
      id: ID_B,
      username: 'bob',
      displayName: 'Bob',
    } as PublicIdentity,
  },
  memberSettings: {},
};

describe('renderFormattedMessage with mentions', () => {
  test('renders a mention with display name and dm-mention class', () => {
    const markedText = `Hey \uFFF0${ID_A}\uFFF1 check this`;
    const html = renderToHtml(markedText, mentionCtx);
    expect(html).toContain('dm-mention');
    expect(html).toContain('@Alice');
    expect(html).toContain('Hey');
    expect(html).toContain('check this');
  });

  test('renders multiple mentions', () => {
    const markedText = `\uFFF0${ID_A}\uFFF1 and \uFFF0${ID_B}\uFFF1`;
    const html = renderToHtml(markedText, mentionCtx);
    expect(html).toContain('@Alice');
    expect(html).toContain('@Bob');
  });

  test('renders unknown identity with dm-mention--unknown class', () => {
    const unknownId = 'fff000111222333444555666';
    const markedText = `\uFFF0${unknownId}\uFFF1`;
    const html = renderToHtml(markedText, mentionCtx);
    expect(html).toContain('dm-mention--unknown');
    expect(html).toContain('@Unknown');
  });

  test('renders Unknown when no mentionCtx is provided', () => {
    const markedText = `\uFFF0${ID_A}\uFFF1`;
    const html = renderToHtml(markedText);
    expect(html).toContain('@Unknown');
  });

  test('mention inside bold renders both formatting and mention', () => {
    const markedText = `**hello \uFFF0${ID_A}\uFFF1**`;
    const html = renderToHtml(markedText, mentionCtx);
    expect(html).toContain('<strong>');
    expect(html).toContain('@Alice');
    expect(html).toContain('dm-mention');
  });

  test('mention inside italic renders correctly', () => {
    const markedText = `*hey \uFFF0${ID_A}\uFFF1*`;
    const html = renderToHtml(markedText, mentionCtx);
    expect(html).toContain('<em>');
    expect(html).toContain('@Alice');
  });

  test('uses nickname from memberSettings over displayName', () => {
    const ctxWithNickname: MentionRenderContext = {
      ...mentionCtx,
      memberSettings: {
        [ID_A]: { nickname: 'Ally' },
      },
    };
    const markedText = `\uFFF0${ID_A}\uFFF1`;
    const html = renderToHtml(markedText, ctxWithNickname);
    expect(html).toContain('@Ally');
    expect(html).not.toContain('@Alice');
  });

  test('text with no mention markers renders normally', () => {
    const html = renderToHtml('Hello world', mentionCtx);
    expect(html).toContain('Hello world');
    expect(html).not.toContain('dm-mention');
  });
});

describe('renderFormattedMessage with custom emojis', () => {
  const map: Record<string, CustomEmojiPayloadEntry> = {
    test_emoji: { id: '1', url: 'https://cdn/e.webp', name: 'Test', animated: false },
    x: { id: '2', url: 'https://cdn/x.gif', name: 'X', animated: true },
  };

  test('replaces shortcode with img', () => {
    const node = renderFormattedMessage('Hello :test_emoji: world', noop, undefined, map);
    const html = node ? renderToStaticMarkup(node as ReactElement) : '';
    expect(html).toContain('https://cdn/e.webp');
    expect(html).toContain('dm-custom-emoji-inline');
    expect(html).not.toContain('Hello :test_emoji: world');
  });

  test('does not inject inside inline code', () => {
    const node = renderFormattedMessage('`:x:`', noop, undefined, map);
    const html = node ? renderToStaticMarkup(node as ReactElement) : '';
    expect(html).toContain(':x:');
    expect(html).not.toContain('dm-custom-emoji-inline');
  });

  test('does not inject inside fenced code block', () => {
    const text = '```\n:x:\n```';
    const node = renderFormattedMessage(text, noop, undefined, map);
    const html = node ? renderToStaticMarkup(node as ReactElement) : '';
    expect(html).toContain(':x:');
    expect(html).not.toContain('dm-custom-emoji-inline');
  });
});

// ---------------------------------------------------------------------------
// renderFormattedMessage with hidden embed tooltip (localized via props)
// ---------------------------------------------------------------------------

describe('renderFormattedMessage with hiddenEmbeds', () => {
  function makeHiddenMap(
    url: string,
    overrides: Partial<HiddenEmbedInfo> = {},
  ): Map<string, HiddenEmbedInfo> {
    return new Map([
      [
        url,
        {
          reason: 'disabled',
          overrideActive: false,
          onToggle: () => {},
          tooltipText: 'Localized tooltip text',
          ...overrides,
        },
      ],
    ]);
  }

  test('renders localized tooltipText from HiddenEmbedInfo', () => {
    const url = 'https://example.com/page';
    const hiddenEmbeds = makeHiddenMap(url, {
      tooltipText: 'Embed hidden (disabled)',
    });
    const node = renderFormattedMessage(url, noop, undefined, undefined, hiddenEmbeds);
    const html = node ? renderToStaticMarkup(node as ReactElement) : '';
    expect(html).toContain('data-tooltip="Embed hidden (disabled)"');
    expect(html).toContain('aria-label="Embed hidden (disabled)"');
  });

  test('renders different tooltip when override is active', () => {
    const url = 'https://example.com/page';
    const hiddenEmbeds = makeHiddenMap(url, {
      overrideActive: true,
      tooltipText: 'Click to hide',
    });
    const node = renderFormattedMessage(url, noop, undefined, undefined, hiddenEmbeds);
    const html = node ? renderToStaticMarkup(node as ReactElement) : '';
    expect(html).toContain('data-tooltip="Click to hide"');
  });

  test('renders eye icon when override is active', () => {
    const url = 'https://example.com/page';
    const hiddenEmbeds = makeHiddenMap(url, { overrideActive: true, tooltipText: 'Hide' });
    const node = renderFormattedMessage(url, noop, undefined, undefined, hiddenEmbeds);
    const html = node ? renderToStaticMarkup(node as ReactElement) : '';
    expect(html).toContain('data-icon="eye"');
  });

  test('renders eyeSlash icon when override is not active', () => {
    const url = 'https://example.com/page';
    const hiddenEmbeds = makeHiddenMap(url, { overrideActive: false, tooltipText: 'Show' });
    const node = renderFormattedMessage(url, noop, undefined, undefined, hiddenEmbeds);
    const html = node ? renderToStaticMarkup(node as ReactElement) : '';
    expect(html).toContain('data-icon="eyeSlash"');
  });

  test('renders toggle button with dm-link-embed-toggle class', () => {
    const url = 'https://example.com/page';
    const hiddenEmbeds = makeHiddenMap(url);
    const node = renderFormattedMessage(url, noop, undefined, undefined, hiddenEmbeds);
    const html = node ? renderToStaticMarkup(node as ReactElement) : '';
    expect(html).toContain('dm-link-embed-toggle');
  });

  test('URL without hidden embed entry gets no toggle button', () => {
    const node = renderFormattedMessage('https://example.com/ok', noop);
    const html = node ? renderToStaticMarkup(node as ReactElement) : '';
    expect(html).not.toContain('dm-link-embed-toggle');
  });
});

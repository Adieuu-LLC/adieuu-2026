/**
 * Discord-style markdown parser for chat messages.
 *
 * Supports:
 *   **bold**  *italic*  __underline__  ~~strikethrough~~
 *   `inline code`   ```code blocks```
 *   - unordered lists   1. ordered lists
 *
 * Produces React elements directly — no `dangerouslySetInnerHTML`, no
 * XSS surface. Integrates with the existing URL-detection pipeline
 * from `urlParsing` so that links inside formatted text remain clickable.
 *
 * @module utils/markdownParser
 */

import { type ReactNode, type ReactElement, createElement, cloneElement, isValidElement } from 'react';
import { createCustomEmojiColonTokenRegex, type PublicIdentity, type CustomEmojiPayloadEntry } from '@adieuu/shared';
import type { MentionEntity, PageTagEntity } from '../services/messagePayload';
import { groupMentionDisplayText, isGroupMentionId } from '../components/composer/composerTypes';
import { getTaggablePage } from '../navigation/taggablePages';
import type { AppIconName } from '../icons/appIcons';
import type { MemberSettingsMap } from '../services/conversationCryptoService';
import { IdentityHoverCard } from '../components/IdentityHoverCard';
import { Tooltip } from '../components/Tooltip';
import { Icon } from '../icons/Icon';
import { parseMessageSegments } from './urlParsing';

// ---------------------------------------------------------------------------
// Emoji-only detection
// ---------------------------------------------------------------------------

/**
 * Matches a broad set of Unicode emoji: emoticons, dingbats, symbols,
 * supplemental symbols, regional indicators, variation selectors, ZWJ, skin
 * tone modifiers, and keycap sequences. Greedy + global so we can strip all
 * emoji from a string in one pass.
 */
// biome-ignore lint/suspicious/noMisleadingCharacterClass: combining characters (ZWJ, keycap) are intentionally matched as standalone code points for emoji stripping
const UNICODE_EMOJI_RE =  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\u{2300}-\u{23FF}\u{2B05}-\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}\u{FE0E}\u{FE0F}\u{200C}\u{200D}]+/gu;

/**
 * Returns `true` when `text` consists exclusively of emoji (native Unicode
 * and/or known custom `:shortcode:` tokens) and whitespace -- i.e. the user
 * sent a standalone emoji message with no prose.
 *
 * Returns `false` for anything with markdown formatting, code blocks, lists,
 * URLs, or mention markers.
 */
export function isEmojiOnlyMessage(
  text: string,
  customEmojis?: Record<string, CustomEmojiPayloadEntry>,
): boolean {
  if (!text) return false;

  const blocks = parseBlocks(text);
  const block = blocks[0];
  if (blocks.length !== 1 || block?.type !== 'paragraph') return false;

  let remaining = block.content;

  if (remaining.includes(MENTION_START) || remaining.includes(PAGE_TAG_START)) return false;

  if (customEmojis && Object.keys(customEmojis).length > 0) {
    const pattern = createCustomEmojiColonTokenRegex();
    remaining = remaining.replace(pattern, (full, sc: string) => {
      const key = sc?.toLowerCase();
      return key && customEmojis[key] ? '' : full;
    });
  }

  remaining = remaining.replace(UNICODE_EMOJI_RE, '');

  return remaining.trim().length === 0;
}

// ---------------------------------------------------------------------------
// Block-level parsing
// ---------------------------------------------------------------------------

interface CodeBlock {
  type: 'codeblock';
  language?: string;
  content: string;
}

interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: string[];
}

interface ParagraphBlock {
  type: 'paragraph';
  content: string;
}

type Block = CodeBlock | ListBlock | ParagraphBlock;

const UL_ITEM_RE = /^[*-] (.*)$/;
const OL_ITEM_RE = /^\d+[.)] (.*)$/;

function lineAt(lines: string[], i: number): string {
  return lines[i] ?? '';
}

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lineAt(lines, i);

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lineAt(lines, i).startsWith('```')) {
        codeLines.push(lineAt(lines, i));
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({
        type: 'codeblock',
        language: lang || undefined,
        content: codeLines.join('\n'),
      });
      continue;
    }

    if (UL_ITEM_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_ITEM_RE.test(lineAt(lines, i))) {
        const m = lineAt(lines, i).match(UL_ITEM_RE);
        if (m) items.push(m[1] ?? '');
        i++;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }

    if (OL_ITEM_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_ITEM_RE.test(lineAt(lines, i))) {
        const m = lineAt(lines, i).match(OL_ITEM_RE);
        if (m) items.push(m[1] ?? '');
        i++;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lineAt(lines, i);
      if (cur.startsWith('```') || UL_ITEM_RE.test(cur) || OL_ITEM_RE.test(cur)) break;
      paraLines.push(cur);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Mention marker injection
// ---------------------------------------------------------------------------

const MENTION_START = '\uFFF0';
const MENTION_END = '\uFFF1';
const PAGE_TAG_START = '\uFFF2';
const PAGE_TAG_END = '\uFFF3';

/**
 * Context passed to the renderer for resolving and rendering @mentions.
 */
export interface MentionRenderContext {
  profiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  selfId?: string;
  onMentionClick?: (identityId: string) => void;
}

/**
 * Replace mention entity spans in `text` with inline markers that the
 * format-rule pipeline can detect. Must be called **before** block/inline
 * parsing so that the markers survive the split.
 *
 * Processes mentions in reverse-offset order to avoid invalidating earlier
 * offsets when splicing.
 */
export function injectMentionMarkers(text: string, mentions: MentionEntity[]): string {
  if (!mentions.length) return text;

  const sorted = [...mentions].sort((a, b) => b.offset - a.offset);
  let result = text;
  for (const m of sorted) {
    if (m.offset < 0 || m.offset + m.length > result.length) continue;
    result =
      result.slice(0, m.offset) +
      MENTION_START + m.id + MENTION_END +
      result.slice(m.offset + m.length);
  }
  return result;
}

/**
 * Context passed to the renderer for resolving and rendering #page-tags.
 */
export interface PageTagRenderContext {
  canAccess: (pageId: string) => boolean;
  navigate: (path: string) => void;
}

export function injectPageTagMarkers(text: string, pageTags: PageTagEntity[]): string {
  if (!pageTags.length) return text;

  const sorted = [...pageTags].sort((a, b) => b.offset - a.offset);
  let result = text;
  for (const p of sorted) {
    if (p.offset < 0 || p.offset + p.length > result.length) continue;
    result =
      result.slice(0, p.offset) +
      PAGE_TAG_START + p.id + PAGE_TAG_END +
      result.slice(p.offset + p.length);
  }
  return result;
}

type EntityMarker =
  | { kind: 'mention'; offset: number; length: number; id: string }
  | { kind: 'pageTag'; offset: number; length: number; id: string };

/**
 * Replace mention and page-tag entity spans in `text` with inline markers.
 * Combines both entity types and processes them in reverse-offset order so
 * interleaved mentions and page-tags don't invalidate each other's offsets.
 */
export function injectEntityMarkers(
  text: string,
  mentions: MentionEntity[],
  pageTags: PageTagEntity[],
): string {
  const entities: EntityMarker[] = [
    ...mentions.map((m) => ({ kind: 'mention' as const, ...m })),
    ...pageTags.map((p) => ({ kind: 'pageTag' as const, ...p })),
  ];
  if (!entities.length) return text;

  const sorted = entities.sort((a, b) => b.offset - a.offset);
  let result = text;
  for (const e of sorted) {
    if (e.offset < 0 || e.offset + e.length > result.length) continue;
    const marker =
      e.kind === 'mention'
        ? MENTION_START + e.id + MENTION_END
        : PAGE_TAG_START + e.id + PAGE_TAG_END;
    result = result.slice(0, e.offset) + marker + result.slice(e.offset + e.length);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

interface FormatRule {
  type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'mention' | 'pageTag';
  pattern: RegExp;
}

/**
 * Ordered by precedence — longer/more specific markers first so that
 * `**` is tried before `*`, and inline code (no nesting) before all
 * text-style markers.
 */
const MENTION_PATTERN = new RegExp(
  `${MENTION_START}([a-f0-9]{24}|__[A-Z]+__)${MENTION_END}`,
);

const PAGE_TAG_PATTERN = new RegExp(
  `${PAGE_TAG_START}([a-z0-9_-]+)${PAGE_TAG_END}`,
);

const FORMAT_RULES: FormatRule[] = [
  { type: 'mention',       pattern: MENTION_PATTERN },
  { type: 'pageTag',       pattern: PAGE_TAG_PATTERN },
  { type: 'code',          pattern: /`([^`\n]+?)`/ },
  { type: 'bold',          pattern: /\*\*(?!\s)([\s\S]+?)(?<!\s)\*\*/ },
  { type: 'strikethrough', pattern: /~~(?!\s)([\s\S]+?)(?<!\s)~~/ },
  { type: 'underline',     pattern: /__(?!\s)([\s\S]+?)(?<!\s)__/ },
  { type: 'italic',        pattern: /(?<!\*)\*(?![*\s])([\s\S]+?)(?<![*\s])\*(?!\*)/ },
];

const TAG_FOR_TYPE = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strikethrough: 'del',
} as const;

export type HiddenEmbedReason = 'disabled' | 'domain-not-allowed';

export interface HiddenEmbedInfo {
  reason: HiddenEmbedReason;
  overrideActive: boolean;
  onToggle: (trigger?: HTMLElement) => void;
  /** Pre-localized tooltip text for the embed toggle button. */
  tooltipText: string;
}

/** Mutable counter threaded through a single render pass for stable keys. */
interface RenderCtx {
  k: number;
  onLinkClick: (href: string) => void;
  mentionCtx?: MentionRenderContext;
  pageTagCtx?: PageTagRenderContext;
  hiddenEmbeds?: Map<string, HiddenEmbedInfo>;
}

function parseInline(text: string, ctx: RenderCtx): ReactNode[] {
  if (!text) return [];

  let earliest: { rule: FormatRule; match: RegExpMatchArray; idx: number } | null = null;

  for (const rule of FORMAT_RULES) {
    const m = text.match(rule.pattern);
    if (m && m.index != null) {
      if (!earliest || m.index < earliest.idx) {
        earliest = { rule, match: m, idx: m.index };
      }
    }
  }

  if (!earliest) {
    return renderTextWithUrls(text, ctx);
  }

  const { rule, match, idx } = earliest;
  const nodes: ReactNode[] = [];

  if (idx > 0) {
    nodes.push(...renderTextWithUrls(text.slice(0, idx), ctx));
  }

  const inner = match[1] ?? '';
  const afterIdx = idx + match[0].length;

  if (rule.type === 'mention') {
    nodes.push(renderMentionNode(inner, ctx));
  } else if (rule.type === 'pageTag') {
    nodes.push(renderPageTagNode(inner, ctx));
  } else if (rule.type === 'code') {
    nodes.push(<code key={ctx.k++} className="dm-md-code">{inner}</code>);
  } else {
    const Tag = TAG_FOR_TYPE[rule.type];
    const children = parseInline(inner, ctx);
    nodes.push(<Tag key={ctx.k++}>{children}</Tag>);
  }

  if (afterIdx < text.length) {
    nodes.push(...parseInline(text.slice(afterIdx), ctx));
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Mention node rendering
// ---------------------------------------------------------------------------

function resolveMentionDisplayName(
  identityId: string,
  mCtx: MentionRenderContext,
): string {
  const groupLabel = groupMentionDisplayText(identityId);
  if (groupLabel) return groupLabel;
  const nickname = mCtx.memberSettings[identityId]?.nickname;
  if (nickname) return nickname;
  const p = mCtx.profiles[identityId];
  return p?.displayName ?? p?.username ?? 'Unknown';
}

function renderMentionNode(identityId: string, ctx: RenderCtx): ReactNode {
  const mCtx = ctx.mentionCtx;
  const isGroupMention = isGroupMentionId(identityId);
  const displayName = mCtx
    ? resolveMentionDisplayName(identityId, mCtx)
    : isGroupMention
      ? groupMentionDisplayText(identityId) ?? 'everyone'
      : 'Unknown';
  const profile = isGroupMention ? undefined : mCtx?.profiles[identityId];

  const mentionSpan = isGroupMention ? (
    <span
      key={ctx.k++}
      className="dm-mention dm-mention--group"
    >
      @{displayName}
    </span>
  ) : (
    // biome-ignore lint/a11y/useSemanticElements: SPA-style navigation without a real href
    <span
      key={ctx.k++}
      className={profile ? 'dm-mention' : 'dm-mention dm-mention--unknown'}
      role="link"
      tabIndex={0}
      onClick={() => mCtx?.onMentionClick?.(identityId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          mCtx?.onMentionClick?.(identityId);
        }
      }}
    >
      @{displayName}
    </span>
  );

  if (profile) {
    return (
      <IdentityHoverCard key={ctx.k++} identity={profile}>
        {mentionSpan}
      </IdentityHoverCard>
    );
  }

  return mentionSpan;
}

// ---------------------------------------------------------------------------
// Page tag node rendering
// ---------------------------------------------------------------------------

function renderPageTagNode(pageId: string, ctx: RenderCtx): ReactNode {
  const page = getTaggablePage(pageId);
  if (!page) {
    return <span key={ctx.k++}>#{pageId}</span>;
  }

  const ptCtx = ctx.pageTagCtx;
  const hasAccess = ptCtx?.canAccess(pageId) ?? false;

  if (!hasAccess) {
    return (
      <Tooltip key={ctx.k++} content="You don't have access to this page" position="top">
        <span className="dm-page-tag dm-page-tag--no-access">
          {page.icon && <Icon name={page.icon as AppIconName} />}
          #{page.labelDefault}
        </span>
      </Tooltip>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: SPA-style navigation without a real href
    <span
      key={ctx.k++}
      className="dm-page-tag"
      role="link"
      tabIndex={0}
      onClick={() => ptCtx?.navigate(page.path)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ptCtx?.navigate(page.path);
        }
      }}
    >
      {page.icon && <Icon name={page.icon as AppIconName} />}
      #{page.labelDefault}
    </span>
  );
}

// ---------------------------------------------------------------------------
// URL-aware text rendering (re-uses the existing segment parser)
// ---------------------------------------------------------------------------

function renderTextWithUrls(text: string, ctx: RenderCtx): ReactNode[] {
  const segments = parseMessageSegments(text);

  return segments.flatMap((seg): ReactNode[] => {
    if (seg.type === 'text') return [seg.value];

    const linkSpan = (
      // biome-ignore lint/a11y/useSemanticElements: SPA-style link handler without a real href
      <span
        key={ctx.k++}
        className="dm-link"
        data-href={seg.href}
        data-link-kind="url"
        role="link"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          ctx.onLinkClick(seg.href);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            ctx.onLinkClick(seg.href);
          }
        }}
      >
        {seg.raw}
      </span>
    );

    const hidden = ctx.hiddenEmbeds?.get(seg.href);
    if (!hidden) return [linkSpan];

    const toggleBtn = (
      <Tooltip key={ctx.k++} content={hidden.tooltipText} position="top">
        <button
          type="button"
          className="dm-link-embed-toggle"
          aria-label={hidden.tooltipText}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            hidden.onToggle(e.currentTarget as HTMLElement);
          }}
        >
          <Icon name={hidden.overrideActive ? 'eye' : 'eyeSlash'} size="sm" />
        </button>
      </Tooltip>
    );

    return [linkSpan, toggleBtn];
  });
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

function renderBlock(block: Block, ctx: RenderCtx): ReactNode {
  if (block.type === 'codeblock') {
    return (
      <pre key={ctx.k++} className="dm-md-codeblock">
        <code>{block.content}</code>
      </pre>
    );
  }

  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul';
    const listKey = ctx.k++;
    return (
      <Tag key={listKey} className="dm-md-list">
        {block.items.map((item) => (
          <li key={ctx.k++}>{parseInline(item, ctx)}</li>
        ))}
      </Tag>
    );
  }

  return (
    <p key={ctx.k++} className="dm-md-paragraph">
      {parseInline(block.content, ctx)}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse Discord-style markdown and render as React elements.
 *
 * Returns a self-contained `<div className="dm-message-text">` wrapper,
 * or `null` when `text` is empty.
 */
/**
 * Recursively walk a React tree and replace text segments containing
 * `:shortcode:` with interleaved text + `<img>` elements.
 */
function injectCustomEmojis(
  node: ReactNode,
  emojis: Record<string, CustomEmojiPayloadEntry>,
  keyRef: { k: number },
  emojiOnly = false,
): ReactNode {
  if (typeof node === 'string') {
    const pattern = createCustomEmojiColonTokenRegex();
    const parts: ReactNode[] = [];
    let lastIdx = 0;
    for (const match of node.matchAll(pattern)) {
      const sc = match[1]?.toLowerCase();
      if (!sc) continue;
      const entry = emojis[sc];
      if (!entry) continue;
      const idx = match.index ?? 0;
      if (idx > lastIdx) {
        parts.push(node.slice(lastIdx, idx));
      }
      parts.push(
        createElement('img', {
          key: `ce-${keyRef.k++}`,
          src: entry.url,
          alt: `:${sc}:`,
          title: entry.name,
          className: emojiOnly ? 'dm-custom-emoji-standalone' : 'dm-custom-emoji-inline',
          width: emojiOnly ? 64 : 20,
          height: emojiOnly ? 64 : 20,
          loading: 'lazy',
        }),
      );
      lastIdx = idx + match[0].length;
    }
    if (parts.length === 0) return node;
    if (lastIdx < node.length) parts.push(node.slice(lastIdx));
    return parts;
  }

  if (Array.isArray(node)) {
    return node.map((child) => injectCustomEmojis(child, emojis, keyRef, emojiOnly));
  }

  if (isValidElement(node)) {
    const el = node as ReactElement;
    const t = el.type;
    if (t === 'code' || t === 'pre') {
      return node;
    }
    const children = el.props.children;
    if (children == null) return node;
    const mapped = injectCustomEmojis(children, emojis, keyRef, emojiOnly);
    if (mapped === children) return node;
    return cloneElement(el, { children: mapped });
  }

  return node;
}

export function renderFormattedMessage(
  text: string,
  onLinkClick: (href: string) => void,
  mentionCtx?: MentionRenderContext,
  customEmojis?: Record<string, CustomEmojiPayloadEntry>,
  hiddenEmbeds?: Map<string, HiddenEmbedInfo>,
  pageTagCtx?: PageTagRenderContext,
): ReactNode | null {
  if (!text) return null;

  const ctx: RenderCtx = { k: 0, onLinkClick, mentionCtx, pageTagCtx, hiddenEmbeds };
  const blocks = parseBlocks(text);
  if (blocks.length === 0) return null;

  const emojiOnly = isEmojiOnlyMessage(text, customEmojis);
  const wrapperClass = emojiOnly ? 'dm-message-text dm-message-emoji-only' : 'dm-message-text';

  let content: ReactNode = (
    <div className={wrapperClass}>
      {blocks.map((block) => renderBlock(block, ctx))}
    </div>
  );

  if (customEmojis && Object.keys(customEmojis).length > 0) {
    content = injectCustomEmojis(content, customEmojis, { k: ctx.k }, emojiOnly);
  }

  return content;
}

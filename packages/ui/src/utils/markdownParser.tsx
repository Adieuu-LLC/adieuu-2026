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

import { type ReactNode } from 'react';
import { parseMessageSegments } from './urlParsing';

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
// Inline parsing
// ---------------------------------------------------------------------------

interface FormatRule {
  type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code';
  pattern: RegExp;
}

/**
 * Ordered by precedence — longer/more specific markers first so that
 * `**` is tried before `*`, and inline code (no nesting) before all
 * text-style markers.
 */
const FORMAT_RULES: FormatRule[] = [
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

/** Mutable counter threaded through a single render pass for stable keys. */
interface RenderCtx {
  k: number;
  onLinkClick: (href: string) => void;
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

  if (rule.type === 'code') {
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
// URL-aware text rendering (re-uses the existing segment parser)
// ---------------------------------------------------------------------------

function renderTextWithUrls(text: string, ctx: RenderCtx): ReactNode[] {
  const segments = parseMessageSegments(text);

  return segments.map((seg) => {
    if (seg.type === 'text') return seg.value;
    return (
      <span
        key={ctx.k++}
        className="dm-link"
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
export function renderFormattedMessage(
  text: string,
  onLinkClick: (href: string) => void,
): ReactNode | null {
  if (!text) return null;

  const ctx: RenderCtx = { k: 0, onLinkClick };
  const blocks = parseBlocks(text);
  if (blocks.length === 0) return null;

  return (
    <div className="dm-message-text">
      {blocks.map((block) => renderBlock(block, ctx))}
    </div>
  );
}

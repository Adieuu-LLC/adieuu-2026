import { describe, expect, test } from 'bun:test';

/**
 * The IntersectionObserver callback in SectionNav picks the topmost
 * intersecting entry (smallest boundingClientRect.top). Since the callback
 * is inside a useEffect closure, we replicate and test the selection
 * algorithm directly to verify determinism regardless of entry order.
 */

// ---------------------------------------------------------------------------
// Replicated selection logic (mirrors SectionNav useEffect callback)
// ---------------------------------------------------------------------------

interface FakeEntry {
  isIntersecting: boolean;
  boundingClientRect: { top: number };
  target: { getAttribute: (attr: string) => string | null };
}

function selectTopmostSection(entries: FakeEntry[]): string | null {
  let topmost: FakeEntry | null = null;
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    if (!topmost || entry.boundingClientRect.top < topmost.boundingClientRect.top) {
      topmost = entry;
    }
  }
  if (topmost) {
    return topmost.target.getAttribute('data-section');
  }
  return null;
}

function makeEntry(id: string, top: number, isIntersecting: boolean): FakeEntry {
  return {
    isIntersecting,
    boundingClientRect: { top },
    target: { getAttribute: (attr: string) => (attr === 'data-section' ? id : null) },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SectionNav topmost-entry selection', () => {
  test('picks entry with smallest top when multiple are intersecting', () => {
    const entries = [
      makeEntry('c', 300, true),
      makeEntry('a', 50, true),
      makeEntry('b', 150, true),
    ];
    expect(selectTopmostSection(entries)).toBe('a');
  });

  test('result is deterministic regardless of entry order', () => {
    const orderings = [
      [makeEntry('a', 300, true), makeEntry('b', 100, true), makeEntry('c', 200, true)],
      [makeEntry('b', 100, true), makeEntry('c', 200, true), makeEntry('a', 300, true)],
      [makeEntry('c', 200, true), makeEntry('a', 300, true), makeEntry('b', 100, true)],
    ];
    for (const entries of orderings) {
      expect(selectTopmostSection(entries)).toBe('b');
    }
  });

  test('ignores non-intersecting entries', () => {
    const entries = [
      makeEntry('a', 10, false),
      makeEntry('b', 200, true),
      makeEntry('c', 500, false),
    ];
    expect(selectTopmostSection(entries)).toBe('b');
  });

  test('returns null when no entries are intersecting', () => {
    const entries = [
      makeEntry('a', 10, false),
      makeEntry('b', 200, false),
    ];
    expect(selectTopmostSection(entries)).toBeNull();
  });

  test('handles single intersecting entry', () => {
    const entries = [makeEntry('only', 100, true)];
    expect(selectTopmostSection(entries)).toBe('only');
  });

  test('handles empty entries array', () => {
    expect(selectTopmostSection([])).toBeNull();
  });

  test('handles negative top values (scrolled past viewport top)', () => {
    const entries = [
      makeEntry('a', -50, true),
      makeEntry('b', 100, true),
    ];
    expect(selectTopmostSection(entries)).toBe('a');
  });

  test('picks first by top when two entries share the same top value', () => {
    const entries = [
      makeEntry('first', 100, true),
      makeEntry('second', 100, true),
    ];
    const result = selectTopmostSection(entries);
    expect(result).toBe('first');
  });

  test('skips entry whose target has no data-section attribute', () => {
    const entryNoAttr: FakeEntry = {
      isIntersecting: true,
      boundingClientRect: { top: 5 },
      target: { getAttribute: () => null },
    };
    const entries = [
      entryNoAttr,
      makeEntry('b', 100, true),
    ];
    // The topmost is entryNoAttr but it has no data-section,
    // so the algorithm would return null (mirrors the `if (id)` guard).
    // We verify the algorithm itself here:
    let topmost: FakeEntry | null = null;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (!topmost || entry.boundingClientRect.top < topmost.boundingClientRect.top) {
        topmost = entry;
      }
    }
    const id = topmost?.target.getAttribute('data-section');
    // topmost is entryNoAttr with null id — the component guards with `if (id)`
    expect(id).toBeNull();
  });
});

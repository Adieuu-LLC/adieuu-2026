/**
 * Pure DOM-math helpers for scrollable message lists.
 *
 * These utilities are channel-agnostic: both Conversations and Space channels
 * share them for auto-scroll, history-anchor preservation, and overflow
 * detection.
 */

/** Sub-pixel tolerance so `scrollHeight` / `clientHeight` rounding does not flip overflow. */
export const SCROLL_OVERFLOW_EPS_PX = 2;

export function computeIsAtBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  thresholdPx: number,
): boolean {
  if (scrollHeight <= clientHeight) return true;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  return distanceFromBottom <= thresholdPx;
}

/**
 * True when the scroll viewport can scroll (content taller than the visible area).
 * Used to avoid auto-paging the message list when the thread is "short" in visible height:
 * the edge sentinels stay intersecting and would otherwise chain-fetch older/newer pages.
 */
export function scrollViewportCanScroll(viewport: HTMLElement): boolean {
  return viewport.scrollHeight > viewport.clientHeight + SCROLL_OVERFLOW_EPS_PX;
}

export function computeScrollTopAfterPrepend(
  prevScrollTop: number,
  prevScrollHeight: number,
  nextScrollHeight: number,
): number {
  return prevScrollTop + (nextScrollHeight - prevScrollHeight);
}

/** Distance from the scroll viewport bottom edge to content bottom (px). */
export function readDistanceFromBottom(scrollViewport: HTMLElement): number {
  return scrollViewport.scrollHeight - scrollViewport.scrollTop - scrollViewport.clientHeight;
}

/** Restore the same distance-from-bottom after content height changes (e.g. prepending newer history). */
export function applyDistanceFromBottom(
  scrollViewport: HTMLElement,
  distanceFromBottom: number,
): void {
  scrollViewport.scrollTop = Math.max(
    0,
    scrollViewport.scrollHeight - scrollViewport.clientHeight - distanceFromBottom,
  );
}

export type HistoryScrollAnchor = {
  /** Stable row key (matches `ChatItem.key` / `data-scroll-anchor-key`). */
  anchorKey: string;
  /** Desired distance from the scroll viewport top to the anchor element top (px). */
  targetViewportOffsetPx: number;
};

/**
 * Keeps a row at the same visual offset after older history is prepended above it.
 * Prefer this over scrollHeight deltas when row heights are asynchronous (images, fonts).
 */
export function applyHistoryScrollAnchor(
  scrollViewport: HTMLElement,
  contentRoot: HTMLElement,
  anchor: HistoryScrollAnchor,
): 'aligned' | 'adjusted' | 'missing' {
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(anchor.anchorKey)
      : anchor.anchorKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const el = contentRoot.querySelector(`[data-scroll-anchor-key="${escaped}"]`);
  if (!el) return 'missing';

  const vRect = scrollViewport.getBoundingClientRect();
  const cr = el.getBoundingClientRect();
  const currentOffset = cr.top - vRect.top;
  const diff = currentOffset - anchor.targetViewportOffsetPx;
  if (Math.abs(diff) < 0.5) return 'aligned';
  scrollViewport.scrollTop += diff;
  return 'adjusted';
}

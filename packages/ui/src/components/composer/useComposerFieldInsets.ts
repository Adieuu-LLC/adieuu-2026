import { useEffect, useState, type RefObject } from 'react';

/** Minimum horizontal inset when a side has no visible controls. */
const MIN_INSET_PX = 15;
/** Row edge offset (`left`/`right: 1px`) plus breathing room before typed text. */
const RAIL_EDGE_OFFSET_PX = 1;
const TEXT_GAP_PX = 4;

export interface ComposerFieldInsets {
  left: number;
  right: number;
}

function railInset(el: HTMLElement | null): number {
  if (!el || el.childElementCount === 0) return MIN_INSET_PX;
  const style = getComputedStyle(el);
  if (style.display === 'none' || el.offsetWidth <= 0) return MIN_INSET_PX;
  return el.offsetWidth + RAIL_EDGE_OFFSET_PX + TEXT_GAP_PX;
}

function measureInsets(
  leftEl: HTMLElement | null,
  rightEl: HTMLElement | null,
): ComposerFieldInsets {
  return {
    left: railInset(leftEl),
    right: railInset(rightEl),
  };
}

/**
 * Tracks composer textarea horizontal padding from the measured width of the
 * absolutely positioned left/right control rails (icons, FS, send, etc.).
 */
export function useComposerFieldInsets(
  leftRef: RefObject<HTMLElement | null>,
  rightRef: RefObject<HTMLElement | null>,
  remeasureKey?: string,
): ComposerFieldInsets {
  const [insets, setInsets] = useState<ComposerFieldInsets>({
    left: MIN_INSET_PX,
    right: MIN_INSET_PX,
  });

  useEffect(() => {
    const leftEl = leftRef.current;
    const rightEl = rightRef.current;
    if (!leftEl && !rightEl) return;

    const update = () => {
      setInsets(measureInsets(leftRef.current, rightRef.current));
    };

    update();

    const resizeObserver = new ResizeObserver(update);
    if (leftEl) resizeObserver.observe(leftEl);
    if (rightEl) resizeObserver.observe(rightEl);

    const mutationObserver = new MutationObserver(update);
    if (leftEl) {
      mutationObserver.observe(leftEl, { childList: true, subtree: true, attributes: true });
    }
    if (rightEl) {
      mutationObserver.observe(rightEl, { childList: true, subtree: true, attributes: true });
    }

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [leftRef, rightRef]);

  useEffect(() => {
    setInsets(measureInsets(leftRef.current, rightRef.current));
  }, [leftRef, rightRef, remeasureKey]);

  return insets;
}

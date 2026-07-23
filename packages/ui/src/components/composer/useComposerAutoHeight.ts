import { useEffect, useRef, useState, type RefObject } from 'react';

type TextMetrics = {
  lineHeight: number;
  verticalPadding: number;
};

/**
 * Auto-grows a composer textarea. Caches line-height/padding so keystrokes
 * avoid repeated getComputedStyle, and only updates isMultiLine when it flips.
 */
export function useComposerAutoHeight(
  inputRef: RefObject<HTMLTextAreaElement | null>,
  messageText: string,
): boolean {
  const [isMultiLine, setIsMultiLine] = useState(false);
  const metricsRef = useRef<TextMetrics | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const readMetrics = () => {
      const cs = getComputedStyle(el);
      metricsRef.current = {
        lineHeight: parseFloat(cs.lineHeight) || 20,
        verticalPadding: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
      };
    };

    readMetrics();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(readMetrics) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [inputRef]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    el.style.height = 'auto';
    const scrollH = el.scrollHeight;
    let metrics = metricsRef.current;
    if (!metrics) {
      const cs = getComputedStyle(el);
      metrics = {
        lineHeight: parseFloat(cs.lineHeight) || 20,
        verticalPadding: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
      };
      metricsRef.current = metrics;
    }
    const singleLineH = Math.ceil(metrics.lineHeight + metrics.verticalPadding);
    // When empty, a wrapping placeholder can inflate scrollHeight beyond what
    // a single line needs -- cap to single-line height so the composer stays compact.
    const effectiveH = messageText ? scrollH : Math.min(scrollH, singleLineH);
    el.style.height = `${effectiveH}px`;
    const multi = effectiveH > singleLineH + 2;
    setIsMultiLine((prev) => (prev === multi ? prev : multi));
    el.style.overflowY = effectiveH >= 500 ? 'auto' : 'hidden';
  }, [inputRef, messageText]);

  return isMultiLine;
}

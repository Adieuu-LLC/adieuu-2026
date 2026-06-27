/**
 * Hook for tracking document visibility state.
 *
 * Returns whether the page is currently visible (tab is focused and not hidden).
 * Useful for suppressing actions when the user isn't actively looking at the page,
 * e.g. not marking messages as read when the tab is in the background.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseDocumentVisibilityResult {
  /** Whether the document is currently visible */
  isVisible: boolean;
  /** Ref that always holds the current visibility (safe for use in callbacks) */
  isVisibleRef: React.RefObject<boolean>;
}

/**
 * Tracks document visibility via the Page Visibility API.
 *
 * @example
 * ```tsx
 * function Conversation() {
 *   const { isVisible, isVisibleRef } = useDocumentVisibility();
 *
 *   // Effect-based: re-fires when visibility changes
 *   useEffect(() => {
 *     if (isVisible && hasUnreadMessages) {
 *       markAsRead();
 *     }
 *   }, [isVisible, hasUnreadMessages]);
 *
 *   // Callback-based: reads current value without stale closure
 *   const onNewMessage = useCallback(() => {
 *     if (isVisibleRef.current) {
 *       markAsRead();
 *     }
 *   }, []);
 * }
 * ```
 */
export function useDocumentVisibility(): UseDocumentVisibilityResult {
  const getVisibility = useCallback(
    () => typeof document !== 'undefined' && document.visibilityState === 'visible',
    []
  );

  const [isVisible, setIsVisible] = useState(getVisibility);
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handler = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);
    };

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return { isVisible, isVisibleRef };
}

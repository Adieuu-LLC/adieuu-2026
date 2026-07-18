/**
 * Viewport-scoped reaction prefetch for non-virtualized message lists.
 *
 * Rather than requesting reactions for every loaded message whenever the buffer
 * changes (which grows O(n) requests per new message and per history page), this
 * hook fetches reactions only for message rows that scroll into (or near) the
 * viewport, once each. Realtime add/remove is handled thereafter by the
 * reaction store's own socket subscription.
 *
 * The IntersectionObserver is created once per entity and rows are observed
 * incrementally via a MutationObserver, so the observer is not torn down and
 * rebuilt on every render / new message.
 *
 * Shared by both Conversations and Space channels.
 *
 * @module hooks/useViewportReactionFetch
 */

import { useEffect, useRef } from 'react';

export interface UseViewportReactionFetchOptions {
  /**
   * Active entity (conversation/channel) id. Changing it resets the dedup set
   * and re-attaches the observer.
   */
  entityId: string | undefined;
  /** Scroll viewport element containing the message rows; used as the IO root. */
  scrollViewportRef: React.RefObject<HTMLElement | null>;
  /** Fetch reactions for the given message ids. */
  fetchReactions: (messageIds: string[]) => void | Promise<unknown>;
  /**
   * Whether the list is mounted with rows available to observe. Passing
   * `flatItems.length > 0` re-attaches once the list first populates (handling
   * the async initial load) without rebuilding on every subsequent message.
   */
  ready?: boolean;
  /** IntersectionObserver rootMargin (prefetch band around the viewport). */
  rootMargin?: string;
  /** Debounce window (ms) for batching intersecting ids into one request. */
  debounceMs?: number;
}

export function useViewportReactionFetch({
  entityId,
  scrollViewportRef,
  fetchReactions,
  ready = true,
  rootMargin = '300px 0px 300px 0px',
  debounceMs = 150,
}: UseViewportReactionFetchOptions): void {
  // Message ids already fetched for the current entity. Persisted across
  // re-attaches; reset only when the entity changes.
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  const fetchedEntityRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!ready || !entityId) return;

    if (fetchedEntityRef.current !== entityId) {
      fetchedEntityRef.current = entityId;
      fetchedIdsRef.current = new Set();
    }
    const fetched = fetchedIdsRef.current;

    let io: IntersectionObserver | null = null;
    let mo: MutationObserver | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let rafId: ReturnType<typeof requestAnimationFrame> | null = null;
    let cancelled = false;

    const attach = (root: HTMLElement) => {
      const pending = new Set<string>();
      const flush = () => {
        flushTimer = null;
        const ids = [...pending].filter((id) => !fetched.has(id));
        pending.clear();
        if (ids.length === 0) return;
        // Only mark as fetched on success so a failed batch is retried when the
        // rows next intersect.
        Promise.resolve(fetchReactions(ids))
          .then(() => {
            for (const id of ids) fetched.add(id);
          })
          .catch(() => {});
      };
      const scheduleFlush = () => {
        if (pending.size > 0 && flushTimer == null) {
          flushTimer = setTimeout(flush, debounceMs);
        }
      };

      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const id = (e.target as HTMLElement).dataset.messageId;
            if (id && !fetched.has(id)) pending.add(id);
          }
          scheduleFlush();
        },
        { root, rootMargin, threshold: 0 },
      );

      const observeRow = (el: Element) => {
        if ((el as HTMLElement).dataset?.messageId) io?.observe(el);
      };
      const observeWithin = (node: Node) => {
        // ELEMENT_NODE only; skip text/comment nodes.
        if (node.nodeType !== 1) return;
        const el = node as Element;
        observeRow(el);
        el.querySelectorAll('[data-message-id]').forEach(observeRow);
      };

      // Observe rows already mounted at attach time.
      root.querySelectorAll('[data-message-id]').forEach(observeRow);

      // Observe rows mounted later (new messages, history prepend) without
      // rebuilding the IntersectionObserver.
      mo =
        typeof MutationObserver !== 'undefined'
          ? new MutationObserver((mutations) => {
              for (const m of mutations) {
                m.addedNodes.forEach(observeWithin);
              }
            })
          : null;
      mo?.observe(root, { childList: true, subtree: true });
    };

    // The scroll viewport is rendered conditionally by the message list, so it
    // may not be mounted yet even though `ready` is already true. Poll on the
    // next frame(s) until it appears, then attach once — this catches the case
    // where the viewport mounts after `ready` flipped true without any hook
    // dependency changing (which would otherwise never re-run this effect).
    const tryAttach = () => {
      if (cancelled) return;
      const root = scrollViewportRef.current;
      if (!root) {
        rafId = requestAnimationFrame(tryAttach);
        return;
      }
      attach(root);
    };
    tryAttach();

    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      if (flushTimer != null) clearTimeout(flushTimer);
      io?.disconnect();
      mo?.disconnect();
    };
  }, [entityId, ready, fetchReactions, rootMargin, debounceMs, scrollViewportRef]);
}

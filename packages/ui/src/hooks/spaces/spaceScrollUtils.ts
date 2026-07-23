/**
 * Shared bounds/helpers for the Space channel message buffer.
 *
 * @module hooks/spaces/spaceScrollUtils
 */

/**
 * Upper bound on how many messages we retain in a channel buffer.
 *
 * Applied at merge time (in {@link useSpaceDataFetching}) so the *stored* buffer
 * never exceeds this — the rendered DOM therefore stays at or below this count
 * with no transient "cap + one page" overshoot. Kept intentionally small so
 * high-traffic channels do not accumulate a large non-virtualized DOM; the
 * trade-off is that reversing scroll direction re-fetches the evicted side.
 */
export const MAX_SPACE_LOADED_MESSAGES = 80;

/**
 * Bounded-buffer trim. `messages` is newest-first (index 0 = newest, last =
 * oldest). When over capacity, retain the window on the side the user is moving
 * toward: `newest` while heading to the live tail, `oldest` while reading back
 * through history.
 */
export function trimSpaceMessages<T>(messages: T[], keep: 'newest' | 'oldest'): T[] {
  if (messages.length <= MAX_SPACE_LOADED_MESSAGES) return messages;
  return keep === 'newest'
    ? messages.slice(0, MAX_SPACE_LOADED_MESSAGES)
    : messages.slice(-MAX_SPACE_LOADED_MESSAGES);
}

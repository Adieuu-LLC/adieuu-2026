/**
 * Display size for inline E2E media, matching the browser's object-fit: contain
 * behavior within a max width × max height box (see .media-message-image).
 */

/** Default single-attachment cap (width/height of the contain box). Keep in sync with `.media-message` / `.media-message-image` in `_conversations-composer-media-messages.scss`. */
export const MEDIA_MESSAGE_INLINE_MAX_PX = 300;

export function getContainedMediaDisplaySize(
  intrinsicWidth: number,
  intrinsicHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (
    !Number.isFinite(intrinsicWidth) ||
    !Number.isFinite(intrinsicHeight) ||
    intrinsicWidth <= 0 ||
    intrinsicHeight <= 0
  ) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(maxWidth / intrinsicWidth, maxHeight / intrinsicHeight);
  return {
    width: intrinsicWidth * scale,
    height: intrinsicHeight * scale,
  };
}

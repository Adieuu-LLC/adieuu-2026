export const CALL_OVERLAY_HEIGHT_STORAGE_KEY = 'adieuu:call-overlay-height-v1';
export const CALL_OVERLAY_HEIGHT_CSS_VAR = '--call-overlay-height';

export const CALL_OVERLAY_MIN_HEIGHT_PX = 220;
export const CALL_OVERLAY_BOTTOM_RESERVE_PX = 80;
export const CALL_OVERLAY_TOP_OFFSET_PX = 65;
export const CALL_OVERLAY_BOTTOM_OFFSET_PX = 23;
export const CALL_OVERLAY_TITLE_BAR_PX = 32;

export function getCallOverlayTopOffsetPx(): number {
  if (typeof document === 'undefined') {
    return CALL_OVERLAY_TOP_OFFSET_PX;
  }
  const hasTitleBar = document.body.classList.contains('has-custom-title-bar');
  return hasTitleBar
    ? CALL_OVERLAY_TOP_OFFSET_PX + CALL_OVERLAY_TITLE_BAR_PX
    : CALL_OVERLAY_TOP_OFFSET_PX;
}

export function getConversationViewHeightPx(viewportHeight: number): number {
  return viewportHeight - getCallOverlayTopOffsetPx();
}

export function getDefaultCallOverlayHeightPx(viewportHeight: number): number {
  return Math.round(getConversationViewHeightPx(viewportHeight) * (2 / 3));
}

export function setCallOverlayHeightCssVar(heightPx: number | null): void {
  if (typeof document === 'undefined') return;
  if (heightPx === null) {
    document.documentElement.style.removeProperty(CALL_OVERLAY_HEIGHT_CSS_VAR);
    return;
  }
  document.documentElement.style.setProperty(
    CALL_OVERLAY_HEIGHT_CSS_VAR,
    `${Math.round(heightPx)}px`,
  );
}

export function clampCallOverlayHeight(
  heightPx: number,
  viewportHeight: number = typeof window !== 'undefined' ? window.innerHeight : 800,
): number {
  const top = getCallOverlayTopOffsetPx();
  const min = CALL_OVERLAY_MIN_HEIGHT_PX;
  const max = viewportHeight - top - CALL_OVERLAY_BOTTOM_RESERVE_PX;
  return Math.min(Math.max(heightPx, min), Math.max(min, max));
}

export function readStoredCallOverlayHeight(): number | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CALL_OVERLAY_HEIGHT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredCallOverlayHeight(heightPx: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CALL_OVERLAY_HEIGHT_STORAGE_KEY, String(Math.round(heightPx)));
  } catch {
    // Best-effort persistence.
  }
}

export function resolveInitialCallOverlayHeight(
  viewportHeight: number = typeof window !== 'undefined' ? window.innerHeight : 800,
): number {
  const stored = readStoredCallOverlayHeight();
  const base = stored ?? getDefaultCallOverlayHeightPx(viewportHeight);
  return clampCallOverlayHeight(base, viewportHeight);
}

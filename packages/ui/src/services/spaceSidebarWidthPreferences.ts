import { clampPanelWidth, readStoredPanelWidth, writeStoredPanelWidth } from './panelWidthStorage';

export const SPACE_SIDEBAR_WIDTH_STORAGE_KEY = 'adieuu:space-sidebar-width-v1';
export const SPACE_SIDEBAR_WIDTH_CSS_VAR = '--space-sidebar-width';

export const SPACE_SIDEBAR_DEFAULT_WIDTH_PX = 220;
export const SPACE_SIDEBAR_MIN_WIDTH_PX = 180;
export const SPACE_SIDEBAR_MAX_WIDTH_PX = 400;
/** Reserve room for the Space outlet when clamping against the viewport. */
export const SPACE_SIDEBAR_CONTENT_RESERVE_PX = 280;

export function getDefaultSpaceSidebarWidthPx(): number {
  return SPACE_SIDEBAR_DEFAULT_WIDTH_PX;
}

export function getSpaceSidebarMaxWidthPx(
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1280,
): number {
  return Math.min(
    SPACE_SIDEBAR_MAX_WIDTH_PX,
    Math.max(SPACE_SIDEBAR_MIN_WIDTH_PX, viewportWidth - SPACE_SIDEBAR_CONTENT_RESERVE_PX),
  );
}

export function setSpaceSidebarWidthCssVar(widthPx: number | null): void {
  if (typeof document === 'undefined') return;
  if (widthPx === null) {
    document.documentElement.style.removeProperty(SPACE_SIDEBAR_WIDTH_CSS_VAR);
    return;
  }
  document.documentElement.style.setProperty(
    SPACE_SIDEBAR_WIDTH_CSS_VAR,
    `${Math.round(widthPx)}px`,
  );
}

export function clampSpaceSidebarWidth(
  widthPx: number,
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1280,
): number {
  return clampPanelWidth(
    widthPx,
    SPACE_SIDEBAR_MIN_WIDTH_PX,
    getSpaceSidebarMaxWidthPx(viewportWidth),
  );
}

export function readStoredSpaceSidebarWidth(): number | null {
  return readStoredPanelWidth(SPACE_SIDEBAR_WIDTH_STORAGE_KEY);
}

export function writeStoredSpaceSidebarWidth(widthPx: number): void {
  writeStoredPanelWidth(SPACE_SIDEBAR_WIDTH_STORAGE_KEY, widthPx);
}

export function resolveInitialSpaceSidebarWidth(
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1280,
): number {
  const stored = readStoredSpaceSidebarWidth();
  const base = stored ?? getDefaultSpaceSidebarWidthPx();
  return clampSpaceSidebarWidth(base, viewportWidth);
}

// Apply before first Space layout paint when this module is imported.
if (typeof document !== 'undefined') {
  setSpaceSidebarWidthCssVar(resolveInitialSpaceSidebarWidth());
}

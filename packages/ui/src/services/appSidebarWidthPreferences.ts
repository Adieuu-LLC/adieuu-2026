import { clampPanelWidth, readStoredPanelWidth, writeStoredPanelWidth } from './panelWidthStorage';

export const APP_SIDEBAR_WIDTH_STORAGE_KEY = 'adieuu:app-sidebar-width-v1';
export const APP_SIDEBAR_WIDTH_CSS_VAR = '--app-sidebar-width';

/** Matches `$sidebar-width-collapsed` — condensed rail is the resize floor. */
export const APP_SIDEBAR_MIN_WIDTH_PX = 64;
/**
 * Below this width the expanded rail uses the condensed (icon) layout.
 * Stored widths are always kept at or above this threshold.
 */
export const APP_SIDEBAR_CONDENSED_LAYOUT_BELOW_PX = 100;
/** Historical expanded cap used for the default width calculation. */
export const APP_SIDEBAR_DEFAULT_CAP_PX = 300;
/** Absolute max when the user drags wider than the old 300px cap. */
export const APP_SIDEBAR_MAX_WIDTH_PX = 480;
/** Reserve room for main content when clamping against the viewport. */
export const APP_SIDEBAR_CONTENT_RESERVE_PX = 320;

export function getDefaultAppSidebarWidthPx(
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1280,
): number {
  return Math.min(Math.round(viewportWidth * 0.2), APP_SIDEBAR_DEFAULT_CAP_PX);
}

export function getAppSidebarMaxWidthPx(
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1280,
): number {
  return Math.min(
    APP_SIDEBAR_MAX_WIDTH_PX,
    Math.max(APP_SIDEBAR_MIN_WIDTH_PX, viewportWidth - APP_SIDEBAR_CONTENT_RESERVE_PX),
  );
}

export function setAppSidebarWidthCssVar(widthPx: number | null): void {
  if (typeof document === 'undefined') return;
  if (widthPx === null) {
    document.documentElement.style.removeProperty(APP_SIDEBAR_WIDTH_CSS_VAR);
    return;
  }
  document.documentElement.style.setProperty(
    APP_SIDEBAR_WIDTH_CSS_VAR,
    `${Math.round(widthPx)}px`,
  );
}

export function clampAppSidebarWidth(
  widthPx: number,
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1280,
): number {
  return clampPanelWidth(widthPx, APP_SIDEBAR_MIN_WIDTH_PX, getAppSidebarMaxWidthPx(viewportWidth));
}

export function readStoredAppSidebarWidth(): number | null {
  return readStoredPanelWidth(APP_SIDEBAR_WIDTH_STORAGE_KEY);
}

export function writeStoredAppSidebarWidth(widthPx: number): void {
  // Never persist a width that would immediately re-enter condensed layout on expand.
  if (widthPx < APP_SIDEBAR_CONDENSED_LAYOUT_BELOW_PX) return;
  writeStoredPanelWidth(APP_SIDEBAR_WIDTH_STORAGE_KEY, widthPx);
}

export function resolveInitialAppSidebarWidth(
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1280,
): number {
  const stored = readStoredAppSidebarWidth();
  const base = stored ?? getDefaultAppSidebarWidthPx(viewportWidth);
  return clampAppSidebarWidth(base, viewportWidth);
}

// Apply before first paint when this module is imported by the app shell.
if (typeof document !== 'undefined') {
  setAppSidebarWidthCssVar(resolveInitialAppSidebarWidth());
}

/** Shared localStorage helpers for persisted panel widths (sidebars, etc.). */

export function readStoredPanelWidth(storageKey: string): number | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredPanelWidth(storageKey: string, widthPx: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey, String(Math.round(widthPx)));
  } catch {
    // Best-effort persistence.
  }
}

export function clampPanelWidth(widthPx: number, minPx: number, maxPx: number): number {
  const min = Math.max(0, minPx);
  const max = Math.max(min, maxPx);
  return Math.min(Math.max(Math.round(widthPx), min), max);
}

import type { Platform } from '@adieuu/shared';
import type { DownloadProgress, UpdateStatus } from '../../hooks/useUpdateCheck';

export type SidebarUpdateNavLabel =
  | 'available'
  | 'downloading'
  | 'install'
  | 'restartWeb'
  | 'error';

export type SidebarUpdateNavResolved =
  | { visible: false }
  | {
      visible: true;
      label: SidebarUpdateNavLabel;
      progressPercent: number | null;
    };

/**
 * Pure logic for when the sidebar update row appears and which label to show.
 * Kept separate from the component for straightforward unit tests.
 */
export function resolveSidebarUpdateNav(
  status: UpdateStatus,
  platform: Platform,
  installing: boolean,
  downloadProgress: DownloadProgress | null,
): SidebarUpdateNavResolved {
  if (installing) return { visible: false };
  if (
    status === 'idle'
    || status === 'dismissed'
    || status === 'up-to-date'
    || status === 'checking'
  ) {
    return { visible: false };
  }
  if (status === 'error') {
    return { visible: true, label: 'error', progressPercent: null };
  }
  if (status === 'downloading') {
    return {
      visible: true,
      label: 'downloading',
      progressPercent: downloadProgress?.percent ?? 0,
    };
  }
  if (status === 'ready') {
    if (platform !== 'desktop') return { visible: false };
    return { visible: true, label: 'install', progressPercent: null };
  }
  if (status === 'available') {
    const label = platform === 'web' ? 'restartWeb' : 'available';
    return { visible: true, label, progressPercent: null };
  }
  return { visible: false };
}

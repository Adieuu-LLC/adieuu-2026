/** Utilities for displaying file attachments (type icons, size formatting). */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(value < 10 ? 2 : 1)} ${UNITS[i]}`;
}

const VISUAL_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4',
]);

export function isVisualMediaContentType(contentType: string): boolean {
  return VISUAL_MEDIA_TYPES.has(contentType);
}

type FileIconName = 'fileArrowDown' | 'image' | 'film';

export function fileAttachmentIconName(contentType: string): FileIconName {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'film';
  return 'fileArrowDown';
}

export function truncateFileName(name: string, maxLen = 28): string {
  if (name.length <= maxLen) return name;
  const ext = name.lastIndexOf('.');
  if (ext <= 0) return name.slice(0, maxLen - 3) + '...';
  const extStr = name.slice(ext);
  const base = name.slice(0, ext);
  const keep = maxLen - extStr.length - 3;
  if (keep < 4) return name.slice(0, maxLen - 3) + '...';
  return base.slice(0, keep) + '...' + extStr;
}

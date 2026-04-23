import type { GifAttachment, MediaAttachment } from '../services/messagePayload';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'application/pdf': '.pdf',
};

function safeBaseFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 200);
}

export function suggestedFileNameForE2eAttachment(a: MediaAttachment): string {
  if (a.fileName?.trim()) {
    return safeBaseFileName(a.fileName);
  }
  const lower = a.contentType.toLowerCase();
  const ext = MIME_TO_EXT[lower] ?? '.bin';
  return `attachment-${a.e2eMediaId.replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 12)}${ext}`;
}

export function isRasterImageContentTypeForClipboard(contentType: string): boolean {
  if (!contentType.startsWith('image/')) return false;
  if (contentType.includes('svg')) return false;
  return true;
}

export function e2eAttachmentSupportsCopyImage(attachment: MediaAttachment | undefined): boolean {
  if (!attachment) return false;
  return isRasterImageContentTypeForClipboard(attachment.contentType);
}

export function findE2eAttachment(
  attachments: MediaAttachment[],
  e2eMediaId: string | null,
): MediaAttachment | undefined {
  if (!e2eMediaId) return undefined;
  return attachments.find((a) => a.e2eMediaId === e2eMediaId);
}

export function findGifBySlug(
  gifs: GifAttachment[],
  slug: string | null,
): GifAttachment | undefined {
  if (!slug) return undefined;
  return gifs.find((g) => g.slug === slug);
}

export type MessageContextStash = {
  selection: string;
  linkHref: string | null;
  e2eMediaId: string | null;
  gifSlug: string | null;
  /** From `data-gif-display-url` when right-clicking a GIF/sticker. */
  gifDisplayUrl: string | null;
  /** From `data-gif-suggested-name` for save dialog. */
  gifSuggestedName: string | null;
};

const emptyStash: MessageContextStash = {
  selection: '',
  linkHref: null,
  e2eMediaId: null,
  gifSlug: null,
  gifDisplayUrl: null,
  gifSuggestedName: null,
};

export function captureMessageContextStash(target: EventTarget | null): MessageContextStash {
  if (typeof window === 'undefined' || !target) {
    return { ...emptyStash };
  }
  const t = target as HTMLElement;
  const link = t.closest('.dm-link') as HTMLElement | null;
  const linkHref = link?.getAttribute('data-href') ?? null;
  const mediaRoot = t.closest('.media-message[data-e2e-media-id]') as HTMLElement | null;
  const e2eMediaId = mediaRoot?.getAttribute('data-e2e-media-id') ?? null;
  const gifEl = t.closest('.gif-attachment') as HTMLElement | null;
  const gifSlug = gifEl?.getAttribute('data-gif-slug') ?? null;
  const gifDisplayUrl = gifEl?.getAttribute('data-gif-display-url') ?? null;
  const gifSuggestedName = gifEl?.getAttribute('data-gif-suggested-name') ?? null;
  return {
    selection: window.getSelection()?.toString() ?? '',
    linkHref,
    e2eMediaId,
    gifSlug,
    gifDisplayUrl,
    gifSuggestedName,
  };
}

import type { KlipyItem } from '@adieuu/shared';
import type { GifAttachment } from '../services/messagePayload';

export function klipyItemToGifAttachment(item: KlipyItem, searchTerm: string): GifAttachment {
  return {
    provider: 'klipy',
    type: item.type,
    url: item.url,
    ...(item.posterUrl ? { posterUrl: item.posterUrl } : {}),
    previewUrl: item.previewUrl,
    tinyUrl: item.tinyUrl,
    blurPreview: item.blurPreview,
    width: item.width,
    height: item.height,
    searchTerm: searchTerm || '',
    title: item.title || undefined,
    slug: item.slug,
  };
}

export function routeGifSelection(options: {
  sendNow: boolean;
  gif: GifAttachment;
  onGifSelect: (gif: GifAttachment) => void;
  onGifSendNow?: (gif: GifAttachment) => void;
}): 'sendNow' | 'attach' {
  const { sendNow, gif, onGifSelect, onGifSendNow } = options;
  if (sendNow && onGifSendNow) {
    onGifSendNow(gif);
    return 'sendNow';
  }
  onGifSelect(gif);
  return 'attach';
}

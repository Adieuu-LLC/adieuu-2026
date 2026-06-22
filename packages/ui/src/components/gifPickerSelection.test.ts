import { describe, expect, mock, test } from 'bun:test';
import { klipyItemToGifAttachment, routeGifSelection } from './gifPickerSelection';
import type { KlipyItem } from '@adieuu/shared';

const sampleItem: KlipyItem = {
  id: 1,
  slug: 'wave-123',
  type: 'sticker',
  title: 'Waving sticker',
  url: 'https://static.klipy.com/sticker.webp',
  previewUrl: 'https://static.klipy.com/sticker-sm.webp',
  tinyUrl: 'https://static.klipy.com/sticker-xs.webp',
  blurPreview: 'data:image/jpeg;base64,abc',
  width: 200,
  height: 200,
};

describe('klipyItemToGifAttachment', () => {
  test('maps Klipy item fields to a GifAttachment', () => {
    const gif = klipyItemToGifAttachment(sampleItem, 'wave hello');

    expect(gif).toEqual({
      provider: 'klipy',
      type: 'sticker',
      url: 'https://static.klipy.com/sticker.webp',
      previewUrl: 'https://static.klipy.com/sticker-sm.webp',
      tinyUrl: 'https://static.klipy.com/sticker-xs.webp',
      blurPreview: 'data:image/jpeg;base64,abc',
      width: 200,
      height: 200,
      searchTerm: 'wave hello',
      title: 'Waving sticker',
      slug: 'wave-123',
    });
  });

  test('omits posterUrl when absent', () => {
    const gif = klipyItemToGifAttachment(sampleItem, '');
    expect(gif).not.toHaveProperty('posterUrl');
  });

  test('includes posterUrl when present', () => {
    const withPoster = { ...sampleItem, posterUrl: 'https://static.klipy.com/poster.webp' };
    const gif = klipyItemToGifAttachment(withPoster, 'cats');
    expect(gif.posterUrl).toBe('https://static.klipy.com/poster.webp');
  });

  test('uses empty searchTerm when query is blank', () => {
    const gif = klipyItemToGifAttachment(sampleItem, '');
    expect(gif.searchTerm).toBe('');
  });
});

describe('routeGifSelection', () => {
  const gif = klipyItemToGifAttachment(sampleItem, 'wave');

  test('calls onGifSendNow when sendNow is enabled and handler is provided', () => {
    const onGifSelect = mock(() => {});
    const onGifSendNow = mock(() => {});

    const action = routeGifSelection({
      sendNow: true,
      gif,
      onGifSelect,
      onGifSendNow,
    });

    expect(action).toBe('sendNow');
    expect(onGifSendNow).toHaveBeenCalledWith(gif);
    expect(onGifSelect).not.toHaveBeenCalled();
  });

  test('calls onGifSelect when sendNow is disabled', () => {
    const onGifSelect = mock(() => {});
    const onGifSendNow = mock(() => {});

    const action = routeGifSelection({
      sendNow: false,
      gif,
      onGifSelect,
      onGifSendNow,
    });

    expect(action).toBe('attach');
    expect(onGifSelect).toHaveBeenCalledWith(gif);
    expect(onGifSendNow).not.toHaveBeenCalled();
  });

  test('falls back to onGifSelect when sendNow is enabled but handler is missing', () => {
    const onGifSelect = mock(() => {});

    const action = routeGifSelection({
      sendNow: true,
      gif,
      onGifSelect,
    });

    expect(action).toBe('attach');
    expect(onGifSelect).toHaveBeenCalledWith(gif);
  });
});

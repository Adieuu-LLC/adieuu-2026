import { describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'gif.fallbackLabel' && opts?.term) return `GIF: ${opts.term}`;
      if (key === 'gif.showThisGif') return 'Show this GIF';
      if (key === 'gif.animateOnHoverAria') return 'GIF or sticker';
      return key;
    },
  }),
}));

const { MessageGifAttachment } = await import('./MessageGifAttachment');

const sampleGif = {
  provider: 'klipy' as const,
  type: 'gif' as const,
  url: 'https://static.klipy.com/hd.webp',
  previewUrl: 'https://static.klipy.com/sm.webp',
  tinyUrl: 'https://static.klipy.com/xs.webp',
  blurPreview: 'data:image/jpeg;base64,abc',
  width: 498,
  height: 280,
  searchTerm: 'funny cats',
  slug: 'funny-cats-123',
};

describe('MessageGifAttachment', () => {
  test('renders image when gifsEnabled is true', () => {
    const html = renderToStaticMarkup(
      <MessageGifAttachment gif={sampleGif} gifsEnabled={true} />,
    );
    expect(html).toContain('gif-attachment');
    expect(html).toContain('https://static.klipy.com/hd.webp');
    expect(html).not.toContain('gif-fallback');
  });

  test('renders Klipy watermark on displayed GIF', () => {
    const html = renderToStaticMarkup(
      <MessageGifAttachment gif={sampleGif} gifsEnabled={true} />,
    );
    expect(html).toContain('gif-attachment__watermark');
    expect(html).toContain('image-watermark.svg');
  });

  test('renders fallback with search term when gifsEnabled is false', () => {
    const html = renderToStaticMarkup(
      <MessageGifAttachment gif={sampleGif} gifsEnabled={false} />,
    );
    expect(html).toContain('gif-fallback');
    expect(html).toContain('GIF: funny cats');
    expect(html).toContain('Show this GIF');
    expect(html).not.toContain('gif-attachment__img');
  });

  test('fallback prefers title over searchTerm', () => {
    const gifWithTitle = { ...sampleGif, title: 'Hilarious Cat Clip' };
    const html = renderToStaticMarkup(
      <MessageGifAttachment gif={gifWithTitle} gifsEnabled={false} />,
    );
    expect(html).toContain('GIF: Hilarious Cat Clip');
  });

  test('fallback uses searchTerm when no title', () => {
    const html = renderToStaticMarkup(
      <MessageGifAttachment gif={sampleGif} gifsEnabled={false} />,
    );
    expect(html).toContain('GIF: funny cats');
  });

  test('fallback uses type when no title or searchTerm', () => {
    const gifNoTerm = { ...sampleGif, searchTerm: '' };
    const html = renderToStaticMarkup(
      <MessageGifAttachment gif={gifNoTerm} gifsEnabled={false} />,
    );
    expect(html).toContain('GIF: gif');
  });

  test('max width is capped at 300px', () => {
    const wideGif = { ...sampleGif, width: 600, height: 400 };
    const html = renderToStaticMarkup(
      <MessageGifAttachment gif={wideGif} gifsEnabled={true} />,
    );
    expect(html).toContain('max-width:300px');
  });

  test('applies blur preview as background image', () => {
    const html = renderToStaticMarkup(
      <MessageGifAttachment gif={sampleGif} gifsEnabled={true} />,
    );
    expect(html).toContain('data:image/jpeg;base64,abc');
  });

  test('renders sticker type correctly', () => {
    const sticker = { ...sampleGif, type: 'sticker' as const };
    const html = renderToStaticMarkup(
      <MessageGifAttachment gif={sticker} gifsEnabled={true} />,
    );
    expect(html).toContain('gif-attachment');
    expect(html).toContain('https://static.klipy.com/hd.webp');
  });

  test('hover mode with poster shows still JPG first', () => {
    const withPoster = { ...sampleGif, posterUrl: 'https://static.klipy.com/hd.jpg' };
    const html = renderToStaticMarkup(
      <MessageGifAttachment gif={withPoster} gifsEnabled={true} gifAnimateOnHoverOnly={true} />,
    );
    expect(html).toContain('https://static.klipy.com/hd.jpg');
    expect(html).toContain('data-gif-display-url="https://static.klipy.com/hd.jpg"');
    expect(html).toMatch(/<img[^>]+src="https:\/\/static\.klipy\.com\/hd\.jpg"/);
    expect(html).toContain('tabindex="0"');
  });

  test('hover mode without poster still uses animated url', () => {
    const html = renderToStaticMarkup(
      <MessageGifAttachment gif={sampleGif} gifsEnabled={true} gifAnimateOnHoverOnly={true} />,
    );
    expect(html).toContain('https://static.klipy.com/hd.webp');
  });
});

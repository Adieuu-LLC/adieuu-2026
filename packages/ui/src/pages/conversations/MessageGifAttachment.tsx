/**
 * Renders a GIF/sticker attachment in a message bubble.
 *
 * When GIFs are enabled:  hd.webp image (max-width 300px) with blur_preview placeholder.
 * When GIFs are disabled: accent fallback box showing "GIF: {searchTerm}" with
 *                         a one-off "Show this GIF" reveal button.
 */

import { memo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { GifAttachment } from '../../services/messagePayload';

const MAX_DISPLAY_WIDTH = 300;

export const MessageGifAttachment = memo(function MessageGifAttachment({
  gif,
  gifsEnabled,
}: {
  gif: GifAttachment;
  gifsEnabled: boolean;
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const shouldShow = gifsEnabled || revealed;

  if (!shouldShow) {
    return (
      <div className="gif-fallback">
        <span className="gif-fallback__label">
          {t('gif.fallbackLabel', { term: gif.title || gif.searchTerm || gif.type })}
        </span>
        <button
          type="button"
          className="gif-fallback__reveal"
          onClick={() => setRevealed(true)}
        >
          {t('gif.showThisGif')}
        </button>
      </div>
    );
  }

  const aspectRatio = gif.width && gif.height ? gif.width / gif.height : 1;
  const displayWidth = Math.min(gif.width || MAX_DISPLAY_WIDTH, MAX_DISPLAY_WIDTH);
  const displayHeight = Math.round(displayWidth / aspectRatio);

  const containerStyle: CSSProperties = {
    width: displayWidth,
    height: displayHeight,
    maxWidth: MAX_DISPLAY_WIDTH,
    backgroundImage: gif.blurPreview ? `url(${gif.blurPreview})` : undefined,
    backgroundSize: 'cover',
  };

  const watermarkHeight = Math.round(displayHeight * 0.15);

  return (
    <div className="gif-attachment" style={containerStyle}>
      <img
        src={gif.url}
        alt={gif.searchTerm || gif.type}
        width={displayWidth}
        height={displayHeight}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`gif-attachment__img${loaded ? ' gif-attachment__img--loaded' : ''}`}
      />
      <div className="gif-attachment__watermark">
        <img
          src="/img/klipy/image-watermark.svg"
          alt=""
          height={watermarkHeight}
          aria-hidden="true"
        />
      </div>
    </div>
  );
});

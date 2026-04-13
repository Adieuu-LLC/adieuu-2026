/**
 * Renders a GIF/sticker attachment in a message bubble.
 *
 * When GIFs are enabled:  hd.webp image (max-width 300px) with blur_preview placeholder.
 * When GIFs are disabled: accent fallback box showing "GIF: {searchTerm}" with
 *                         a one-off "Show this GIF" reveal button.
 *
 * When `gifAnimateOnHoverOnly` is set and `posterUrl` exists, shows the still JPG until
 * hover or keyboard focus, then swaps to the animated WebP.
 */

import { memo, useState, useCallback, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { GifAttachment } from '../../services/messagePayload';

const MAX_DISPLAY_WIDTH = 300;

export const MessageGifAttachment = memo(function MessageGifAttachment({
  gif,
  gifsEnabled,
  gifAnimateOnHoverOnly = false,
}: {
  gif: GifAttachment;
  gifsEnabled: boolean;
  /** When true and `gif.posterUrl` is set, still frame until hover/focus */
  gifAnimateOnHoverOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(false);

  const shouldShow = gifsEnabled || revealed;

  const posterUrl = gif.posterUrl;
  const useHoverMode = Boolean(gifAnimateOnHoverOnly && posterUrl);
  const displaySrc = useHoverMode && !active ? posterUrl : gif.url;

  const onEnter = useCallback(() => setActive(true), []);
  const onLeave = useCallback(() => setActive(false), []);

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

  const hoverHandlers = useHoverMode
    ? {
        tabIndex: 0 as const,
        role: 'group' as const,
        'aria-label': t('gif.animateOnHoverAria', 'GIF or sticker'),
        onMouseEnter: onEnter,
        onMouseLeave: onLeave,
        onFocus: onEnter,
        onBlur: onLeave,
      }
    : {};

  return (
    <div className="gif-attachment" style={containerStyle} {...hoverHandlers}>
      <img
        src={displaySrc}
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

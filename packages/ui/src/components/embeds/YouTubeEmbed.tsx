import { memo } from 'react';

export interface YouTubeEmbedProps {
  videoId: string;
  /** When true, the embed renders at full message width (URL-only messages). */
  hero?: boolean;
}

export const YouTubeEmbed = memo(function YouTubeEmbed({ videoId, hero }: YouTubeEmbedProps) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&origin=${encodeURIComponent(origin)}`;

  return (
    <div className={`embed-youtube${hero ? ' embed-youtube--hero' : ''}`}>
      <iframe
        src={src}
        title="YouTube video"
        className="embed-youtube-iframe"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      />
    </div>
  );
});

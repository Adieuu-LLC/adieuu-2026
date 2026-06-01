import { memo, useMemo, useCallback } from 'react';
import { YouTubeEmbed } from './YouTubeEmbed';
import { GenericLinkEmbed, type LinkMetadata } from './GenericLinkEmbed';
import {
  detectEmbeds,
  isUrlOnlyMessage,
  extractTld,
  type EmbedInfo,
} from '../../utils/embedDetection';
import { isDomainAllowed, type EmbedPreference } from '../../hooks/useEmbedPreference';

export interface MessageEmbedsProps {
  text: string;
  preference: EmbedPreference;
  fetchMetadata: (url: string) => Promise<LinkMetadata | null>;
}

export const MessageEmbeds = memo(function MessageEmbeds({
  text,
  preference,
  fetchMetadata,
}: MessageEmbedsProps) {
  const embeds = useMemo(() => detectEmbeds(text), [text]);
  const heroMode = useMemo(() => isUrlOnlyMessage(text), [text]);

  const allowedEmbeds = useMemo(() => {
    if (preference.mode === 'none') return [];
    return embeds.filter((embed) => {
      const domain = extractTld(embed.url);
      if (!domain) return false;
      return isDomainAllowed(domain, preference);
    });
  }, [embeds, preference]);

  const safeFetchMetadata = useCallback(
    (url: string) => fetchMetadata(url),
    [fetchMetadata]
  );

  if (allowedEmbeds.length === 0) return null;

  const maxWidthStyle = preference.maxWidth > 0
    ? { '--embed-max-width': `${preference.maxWidth}px` } as React.CSSProperties
    : { '--embed-max-width': 'none' } as React.CSSProperties;

  return (
    <div className="message-embeds" style={maxWidthStyle}>
      {allowedEmbeds.map((embed) => (
        <EmbedRenderer
          key={embed.url}
          embed={embed}
          hero={heroMode && allowedEmbeds.length === 1}
          fetchMetadata={safeFetchMetadata}
        />
      ))}
    </div>
  );
});

const EmbedRenderer = memo(function EmbedRenderer({
  embed,
  hero,
  fetchMetadata,
}: {
  embed: EmbedInfo;
  hero: boolean;
  fetchMetadata: (url: string) => Promise<LinkMetadata | null>;
}) {
  if (embed.type === 'youtube' && embed.videoId) {
    return <YouTubeEmbed videoId={embed.videoId} hero={hero} />;
  }
  return <GenericLinkEmbed url={embed.url} fetchMetadata={fetchMetadata} />;
});

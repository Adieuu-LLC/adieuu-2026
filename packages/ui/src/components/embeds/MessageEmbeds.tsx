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
  overrides?: Record<string, boolean>;
}

export const MessageEmbeds = memo(function MessageEmbeds({
  text,
  preference,
  fetchMetadata,
  overrides,
}: MessageEmbedsProps) {
  const embeds = useMemo(() => detectEmbeds(text), [text]);
  const heroMode = useMemo(() => isUrlOnlyMessage(text), [text]);

  const allowedEmbeds = useMemo(() => {
    return embeds.filter((embed) => {
      if (overrides?.[embed.url] === true) return true;
      if (overrides?.[embed.url] === false) return false;
      if (preference.mode === 'none') return false;
      const domain = extractTld(embed.url);
      if (!domain) return false;
      return isDomainAllowed(domain, preference);
    });
  }, [embeds, preference, overrides]);

  const safeFetchMetadata = useCallback(
    (url: string) => fetchMetadata(url),
    [fetchMetadata]
  );

  const isHero = heroMode && allowedEmbeds.length === 1;
  const containerStyle = useMemo((): React.CSSProperties => {
    const embedMaxWidth =
      preference.maxWidth > 0 ? `${preference.maxWidth}px` : 'none';

    if (preference.maxWidth > 0 && !isHero) {
      return {
        maxWidth: preference.maxWidth,
        width: '100%',
        minWidth: 0,
        'max-width': embedMaxWidth,
      } as React.CSSProperties;
    }

    return { 'max-width': embedMaxWidth } as React.CSSProperties;
  }, [preference.maxWidth, isHero]);

  if (allowedEmbeds.length === 0) return null;

  return (
    <div className="message-embeds" style={containerStyle}>
      {allowedEmbeds.map((embed) => (
        <EmbedRenderer
          key={embed.url}
          embed={embed}
          hero={isHero}
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

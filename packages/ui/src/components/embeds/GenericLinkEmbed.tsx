import { memo, useState, useEffect } from 'react';

export interface LinkMetadata {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  siteName?: string;
}

export interface GenericLinkEmbedProps {
  url: string;
  fetchMetadata: (url: string) => Promise<LinkMetadata | null>;
}

export const GenericLinkEmbed = memo(function GenericLinkEmbed({
  url,
  fetchMetadata,
}: GenericLinkEmbedProps) {
  const [meta, setMeta] = useState<LinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    fetchMetadata(url)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setMeta(data);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [url, fetchMetadata]);

  if (loading) {
    return (
      <div className="embed-link embed-link--loading">
        <div className="embed-link-skeleton" />
      </div>
    );
  }

  if (failed || !meta || (!meta.title && !meta.description)) {
    return null;
  }

  let displayDomain: string | undefined;
  try {
    displayDomain = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    // ignore
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="embed-link"
      onClick={(e) => e.stopPropagation()}
    >
      {meta.image && (
        <div className="embed-link-image">
          <img src={meta.image} alt="" loading="lazy" />
        </div>
      )}
      <div className="embed-link-body">
        {(meta.siteName || displayDomain) && (
          <span className="embed-link-site">
            {meta.favicon && (
              <img src={meta.favicon} alt="" className="embed-link-favicon" />
            )}
            {meta.siteName || displayDomain}
          </span>
        )}
        {meta.title && (
          <span className="embed-link-title">{meta.title}</span>
        )}
        {meta.description && (
          <span className="embed-link-description">{meta.description}</span>
        )}
      </div>
    </a>
  );
});

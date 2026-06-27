/**
 * Renders GIF/sticker evidence from a reported message (Klipy URL references).
 *
 * @module pages/moderation/ReportEvidenceGifSection
 */

import type { PublicEvidenceGifAttachment } from '@adieuu/shared';

export interface ReportEvidenceGifSectionProps {
  items: PublicEvidenceGifAttachment[];
  labelGif: string;
  labelSticker: string;
  altPreview: string;
}

export function ReportEvidenceGifSection({
  items,
  labelGif,
  labelSticker,
  altPreview,
}: ReportEvidenceGifSectionProps) {
  if (!items.length) return null;

  return (
    <div
      className="moderation-evidence-gifs"
      style={{
        marginTop: '0.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}
    >
      {items.map((gif) => (
        <div
          key={`${gif.slug}-${gif.url}`}
          style={{
            maxWidth: '100%',
            borderRadius: '0.375rem',
            border: '1px solid var(--color-border-subtle, rgba(0,0,0,0.08))',
            overflow: 'hidden',
            background: 'var(--color-surface-alt, rgba(0,0,0,0.04))',
          }}
        >
          <div
            style={{
              fontSize: '0.6875rem',
              padding: '0.25rem 0.5rem',
              opacity: 0.85,
              display: 'flex',
              justifyContent: 'space-between',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            <span>{gif.type === 'sticker' ? labelSticker : labelGif}</span>
            {gif.title ? (
              <span style={{ fontWeight: 500 }}>{gif.title}</span>
            ) : (
              <span style={{ opacity: 0.8 }}>{gif.searchTerm}</span>
            )}
          </div>
          <a
            href={gif.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', lineHeight: 0 }}
          >
            <img
              src={gif.posterUrl ?? gif.previewUrl ?? gif.url}
              alt={altPreview}
              width={gif.width}
              height={gif.height}
              loading="lazy"
              style={{
                maxWidth: 'min(280px, 100%)',
                height: 'auto',
                display: 'block',
                objectFit: 'contain',
              }}
            />
          </a>
        </div>
      ))}
    </div>
  );
}

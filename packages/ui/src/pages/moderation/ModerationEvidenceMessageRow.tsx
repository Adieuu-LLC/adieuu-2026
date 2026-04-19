/**
 * Single message line in moderation report evidence.
 *
 * @module pages/moderation/ModerationEvidenceMessageRow
 */

import { useTranslation } from 'react-i18next';
import type { PublicMessageEvidence } from '@adieuu/shared';
import { ReportEvidenceGifSection } from './ReportEvidenceGifSection';

export interface ModerationEvidenceMessageRowProps {
  msg: PublicMessageEvidence;
  fmtId: (identityId: string | undefined) => string;
}

export function ModerationEvidenceMessageRow({ msg, fmtId }: ModerationEvidenceMessageRowProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`moderation-evidence-message ${msg.isTargetMessage ? 'moderation-evidence-message--target' : ''}`}
      style={{
        padding: '0.75rem',
        borderRadius: '0.5rem',
        marginBottom: '0.5rem',
        background: msg.isTargetMessage
          ? 'var(--color-danger-bg, rgba(220,38,38,0.1))'
          : 'var(--color-surface-alt, rgba(0,0,0,0.03))',
        border: msg.isTargetMessage ? '1px solid var(--color-danger, #dc2626)' : '1px solid transparent',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          opacity: 0.7,
          marginBottom: '0.25rem',
        }}
      >
        <span>
          <span>{fmtId(msg.fromIdentityId)}</span>
          {msg.isTargetMessage && (
            <span style={{ marginLeft: '0.5rem', fontWeight: 600, color: 'var(--color-danger, #dc2626)' }}>
              {t('moderation.detail.targetMessage')}
            </span>
          )}
          {!msg.isTargetMessage && (
            <span style={{ marginLeft: '0.5rem' }}>{t('moderation.detail.contextMessage')}</span>
          )}
        </span>
        <span>{new Date(msg.createdAt).toLocaleString()}</span>
      </div>
      <p style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap' }}>{msg.decryptedText}</p>
      <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', marginTop: '0.25rem' }}>
        <span
          style={{
            color: msg.signatureVerified ? 'var(--color-success, green)' : 'var(--color-warning, orange)',
          }}
        >
          {msg.signatureVerified
            ? t('moderation.detail.signatureVerified')
            : t('moderation.detail.signatureUnverified')}
        </span>
      </div>
      {msg.attachments && msg.attachments.length > 0 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>
          {msg.attachments.map((att) => (
            <span
              key={att.e2eMediaId}
              className="moderation-evidence-attachment"
              style={{
                display: 'inline-block',
                padding: '0.25rem 0.5rem',
                marginRight: '0.25rem',
                borderRadius: '0.25rem',
                background: 'var(--color-surface-alt, rgba(0,0,0,0.05))',
                fontSize: '0.75rem',
              }}
            >
              {att.fileName || att.contentType} (
              {att.sizeBytes ? `${Math.round(att.sizeBytes / 1024)}KB` : att.e2eMediaId})
            </span>
          ))}
        </div>
      )}
      {msg.gifAttachments && msg.gifAttachments.length > 0 && (
        <ReportEvidenceGifSection
          items={msg.gifAttachments}
          labelGif={t('moderation.detail.evidenceGif')}
          labelSticker={t('moderation.detail.evidenceSticker')}
          altPreview={t('moderation.detail.evidenceGifAlt')}
        />
      )}
    </div>
  );
}

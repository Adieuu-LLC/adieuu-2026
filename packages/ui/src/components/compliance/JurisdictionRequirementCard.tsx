import { useTranslation } from 'react-i18next';
import type { PublicJurisdictionRequirement } from '@adieuu/shared';

export interface JurisdictionRequirementCardProps {
  row: PublicJurisdictionRequirement;
  compact?: boolean;
}

function formatSlugs(slugs: string[]): string {
  return slugs.map((slug) => slug.replaceAll('_', ' ')).join(' · ');
}

export function JurisdictionRequirementCard({ row, compact = false }: JurisdictionRequirementCardProps) {
  const { t } = useTranslation();

  return (
    <article className={`jurisdiction-requirement-card${compact ? ' jurisdiction-requirement-card--compact' : ''}`}>
      <div className="jurisdiction-requirement-card__header">
        <strong className="jurisdiction-requirement-card__name">{row.jurisdictionName}</strong>
        <span className="jurisdiction-requirement-card__meta account-detail-muted">
          {row.jurisdiction} — {row.region}
        </span>
        {row.status === 'proposed' && (
          <span className="jurisdiction-requirement-card__proposed">
            {t('compliance.jurisdictionRequirement.proposed')}
          </span>
        )}
      </div>

      {row.regulatoryBody != null && row.regulatoryBody !== '' && (
        <p className="jurisdiction-requirement-card__field">
          <span className="account-detail-muted">
            {t('compliance.jurisdictionRequirement.regulatoryBody')}:{' '}
          </span>
          {row.regulatoryBody}
        </p>
      )}

      {row.legislation.length > 0 && (
        <div className="jurisdiction-requirement-card__field">
          <span className="account-detail-label jurisdiction-requirement-card__label">
            {t('compliance.jurisdictionRequirement.legislation')}
          </span>
          <ul className="jurisdiction-requirement-card__legislation">
            {row.legislation.map((leg) => (
              <li key={leg.name}>
                {leg.url != null && leg.url !== '' ? (
                  <a href={leg.url} target="_blank" rel="noopener noreferrer">
                    {leg.name}
                  </a>
                ) : (
                  leg.name
                )}
                {leg.enactmentDate != null && leg.enactmentDate !== '' && (
                  <span className="account-detail-muted jurisdiction-requirement-card__enactment">
                    ({leg.enactmentDate})
                  </span>
                )}
                {leg.notes != null && leg.notes !== '' && (
                  <p className="account-detail-muted jurisdiction-requirement-card__leg-notes">
                    {leg.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {row.requirements.length > 0 && (
        <p className="jurisdiction-requirement-card__field">
          <span className="account-detail-muted">
            {t('compliance.jurisdictionRequirement.requirements')}:{' '}
          </span>
          {formatSlugs(row.requirements)}
        </p>
      )}

      {row.compatibleMethods.length > 0 && (
        <p className="jurisdiction-requirement-card__field">
          <span className="account-detail-muted">
            {t('compliance.jurisdictionRequirement.methods')}:{' '}
          </span>
          {formatSlugs(row.compatibleMethods)}
        </p>
      )}

      {row.notes != null && row.notes !== '' && (
        <p className="account-detail-muted jurisdiction-requirement-card__notes">
          {t('compliance.jurisdictionRequirement.notes')}: {row.notes}
        </p>
      )}
    </article>
  );
}

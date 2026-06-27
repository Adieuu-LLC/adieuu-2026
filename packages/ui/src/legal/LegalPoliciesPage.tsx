import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/Card';
import { LEGAL_POLICIES, getLegalPolicyPath } from './policies';

export function LegalPoliciesPage() {
  const { t } = useTranslation();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('legal.directoryTitle')}</h1>
          <p className="page-subtitle">{t('legal.directorySubtitle')}</p>
        </div>

        <Card variant="elevated" className="slide-up legal-policies-directory">
          <ul className="legal-policies-list">
            {LEGAL_POLICIES.map((policy) => (
              <li key={policy.slug} className="legal-policies-list-item">
                <Link to={getLegalPolicyPath(policy.slug)} className="legal-policies-link">
                  <span className="legal-policies-link-title">{policy.title}</span>
                  {policy.description ? (
                    <span className="legal-policies-link-description">{policy.description}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

import { Suspense, useCallback, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { Icon } from '../icons/Icon';
import { getLegalPolicy } from './policies';
import { getLegalPolicyContent } from './policy-content';

export function LegalPolicyPage() {
  const { slug } = useParams<{ slug: string }>();
  const policy = slug ? getLegalPolicy(slug) : undefined;
  const Content = slug ? getLegalPolicyContent(slug) : undefined;
  const [highContrast, setHighContrast] = useState(false);

  const toggleHighContrast = useCallback(() => {
    setHighContrast((v) => !v);
  }, []);

  if (!policy || !Content) {
    return <Navigate to="/legal-policies" replace />;
  }

  const { title } = policy;

  return (
    <div className={`page-content${highContrast ? ' legal-policy-page-high-contrast' : ''}`}>
      <div className="container">
        <div className="page-header">
          <Link to="/legal-policies" className="legal-policy-back-link">
            <Icon name="arrowLeft" size="sm" />
            <span>View All Policies</span>
          </Link>
          <h1 className="page-title legal-policy-page-title">{title}</h1>
        </div>

        <Card variant="elevated" className="slide-up legal-policy-content">
          <Suspense
            fallback={
              <div className="route-loading">
                <div className="spinner spinner-lg" />
              </div>
            }
          >
            <Content
              highContrast={highContrast}
              onToggleHighContrast={toggleHighContrast}
            />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}

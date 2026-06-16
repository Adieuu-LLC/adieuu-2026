import { useCallback, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { getLegalPolicy } from './policies';

export function LegalPolicyPage() {
  const { slug } = useParams<{ slug: string }>();
  const policy = slug ? getLegalPolicy(slug) : undefined;
  const [highContrast, setHighContrast] = useState(false);

  const toggleHighContrast = useCallback(() => {
    setHighContrast((v) => !v);
  }, []);

  if (!policy) {
    return <Navigate to="/legal-policies" replace />;
  }

  const { Content, title } = policy;

  return (
    <div className={`page-content${highContrast ? ' legal-policy-page-high-contrast' : ''}`}>
      <div className="container">
        <div className="page-header">
          <h1 className="page-title legal-policy-page-title">{title}</h1>
        </div>

        <Card variant="elevated" className="slide-up legal-policy-content">
          <Content
            highContrast={highContrast}
            onToggleHighContrast={toggleHighContrast}
          />
        </Card>
      </div>
    </div>
  );
}

import { Navigate, useParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { getLegalPolicy } from './policies';

export function LegalPolicyPage() {
  const { slug } = useParams<{ slug: string }>();
  const policy = slug ? getLegalPolicy(slug) : undefined;

  if (!policy) {
    return <Navigate to="/legal-policies" replace />;
  }

  const { Content, title } = policy;

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{title}</h1>
        </div>

        <Card variant="elevated" className="slide-up legal-policy-content">
          <Content />
        </Card>
      </div>
    </div>
  );
}

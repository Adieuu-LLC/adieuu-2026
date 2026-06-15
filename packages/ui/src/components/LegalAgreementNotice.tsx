import { Link } from 'react-router-dom';
import { Trans } from 'react-i18next';
import { getLegalPolicyPath } from '../legal/policies';

export type LegalAgreementNoticeVariant = 'auth' | 'inline' | 'compact';

interface LegalAgreementNoticeProps {
  variant?: LegalAgreementNoticeVariant;
  className?: string;
}

function linkClassName(variant: LegalAgreementNoticeVariant): string {
  if (variant === 'auth') return 'auth-link';
  return 'legal-agreement-link';
}

export function LegalAgreementNotice({
  variant = 'inline',
  className,
}: LegalAgreementNoticeProps) {
  const linkClass = linkClassName(variant);
  const defaultClassName =
    variant === 'compact' ? 'legal-agreement-notice legal-agreement-notice--compact' : 'legal-agreement-notice';

  return (
    <p className={className ?? defaultClassName}>
      <Trans
        i18nKey="legal.agreementNotice"
        components={{
          tosLink: <Link to={getLegalPolicyPath('tos')} className={linkClass} />,
          privacyLink: <Link to={getLegalPolicyPath('privacy')} className={linkClass} />,
        }}
      />
    </p>
  );
}

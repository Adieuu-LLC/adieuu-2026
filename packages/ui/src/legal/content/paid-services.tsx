import type { LegalPolicySection } from '../LegalPolicyDocument';
import { LegalPolicyDocument } from '../LegalPolicyDocument';

const PAID_SERVICES_SECTIONS: LegalPolicySection[] = [
  {
    id: 'overview',
    title: 'Overview',
    content: (
      <>
        <p>
          <strong>Effective:</strong> 15 June 2026<br />
          <strong>Last Updated:</strong> 15 June 2026
        </p>
        <p>
          These Paid Services Terms govern subscriptions, sponsorships, and other paid features on
          Adieuu. They are incorporated into our{' '}
          <a href="/legal-policies/tos" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: 'billing',
    title: 'Billing and Renewals',
    content: (
      <p>
        Paid plans renew according to the billing interval shown at purchase unless cancelled.
        Pricing, taxes, and renewal terms for each offering are displayed before checkout.
      </p>
    ),
  },
  {
    id: 'cancellations',
    title: 'Cancellations and Refunds',
    content: (
      <p>
        You may cancel recurring subscriptions through your account settings. Refund eligibility
        depends on the specific product purchased and applicable law. Additional cancellation and
        refund terms will be documented here as offerings are finalized.
      </p>
    ),
  },
];

interface ContentProps {
  highContrast?: boolean;
  onToggleHighContrast?: () => void;
}

export function PaidServicesTermsContent({ highContrast, onToggleHighContrast }: ContentProps) {
  return (
    <LegalPolicyDocument
      sections={PAID_SERVICES_SECTIONS}
      highContrast={highContrast}
      onToggleHighContrast={onToggleHighContrast}
    />
  );
}

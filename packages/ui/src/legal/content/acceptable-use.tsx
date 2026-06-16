import type { LegalPolicySection } from '../LegalPolicyDocument';
import { LegalPolicyDocument } from '../LegalPolicyDocument';

const ACCEPTABLE_USE_SECTIONS: LegalPolicySection[] = [
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
          This Acceptable Use Policy describes conduct that is prohibited on Adieuu. It is
          incorporated into our{' '}
          <a href="/legal-policies/tos" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: 'prohibited-conduct',
    title: 'Prohibited Conduct',
    content: (
      <p>
        You may not use Adieuu to harass, threaten, or abuse others; distribute malware or spam;
        attempt unauthorized access; violate applicable law; or interfere with the security or
        operation of the service. Additional prohibited conduct will be documented here as policies
        are finalized.
      </p>
    ),
  },
  {
    id: 'enforcement',
    title: 'Enforcement',
    content: (
      <p>
        Violations may result in content removal, feature restrictions, or account suspension.
        Report abuse to{' '}
        <a href="mailto:abuse@adieuu.com" rel="noopener noreferrer" target="_blank">
          abuse@adieuu.com
        </a>
        .
      </p>
    ),
  },
];

interface ContentProps {
  highContrast?: boolean;
  onToggleHighContrast?: () => void;
}

export function AcceptableUsePolicyContent({ highContrast, onToggleHighContrast }: ContentProps) {
  return (
    <LegalPolicyDocument
      sections={ACCEPTABLE_USE_SECTIONS}
      highContrast={highContrast}
      onToggleHighContrast={onToggleHighContrast}
    />
  );
}

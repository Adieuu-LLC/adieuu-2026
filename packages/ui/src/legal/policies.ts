import type { ComponentType } from 'react';
import { TermsOfServiceContent } from './content/tos';
import { PrivacyPolicyContent } from './content/privacy';

export interface LegalPolicyContentProps {
  highContrast?: boolean;
  onToggleHighContrast?: () => void;
}

export interface LegalPolicyDefinition {
  slug: string;
  title: string;
  description?: string;
  showInFooter?: boolean;
  Content: ComponentType<LegalPolicyContentProps>;
}

export const LEGAL_POLICIES: LegalPolicyDefinition[] = [
  {
    slug: 'tos',
    title: 'Terms of Service',
    description: 'The rules and guidelines for using Adieuu.',
    showInFooter: true,
    Content: TermsOfServiceContent,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    description: 'How we collect, use, and protect your information.',
    showInFooter: true,
    Content: PrivacyPolicyContent,
  },
];

export function getLegalPolicy(slug: string): LegalPolicyDefinition | undefined {
  return LEGAL_POLICIES.find((policy) => policy.slug === slug);
}

export function getFooterLegalLinks(): LegalPolicyDefinition[] {
  return LEGAL_POLICIES.filter((policy) => policy.showInFooter !== false);
}

export function getLegalPolicyPath(slug: string): string {
  return `/legal-policies/${slug}`;
}

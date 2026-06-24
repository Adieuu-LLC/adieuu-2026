/**
 * Policy *metadata* only. Deliberately free of any reference to the heavy policy
 * content components so that footer links, agreement notices, and the policy
 * directory (all of which only need slug/title/path) don't pull the full legal
 * text into their bundles. The content components are loaded lazily via
 * `./policy-content`.
 */

export interface LegalPolicyContentProps {
  highContrast?: boolean;
  onToggleHighContrast?: () => void;
}

export interface LegalPolicyDefinition {
  slug: string;
  title: string;
  description?: string;
  showInFooter?: boolean;
}

export const LEGAL_POLICIES: LegalPolicyDefinition[] = [
  {
    slug: 'acceptable-use',
    title: 'Acceptable Use Policy',
    description: 'Rules for acceptable conduct on Adieuu.',
    showInFooter: false,
  },
  {
    slug: 'idea-submission-terms',
    title: 'Idea Submission Terms',
    description: 'Terms governing feature requests and feedback submissions.',
    showInFooter: false,
  },
  {
    slug: 'paid-services',
    title: 'Paid Services Terms',
    description: 'Terms for subscriptions and other paid features.',
    showInFooter: false,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    description: 'How we collect, use, and protect your information.',
    showInFooter: true,
  },
  {
    slug: 'tos',
    title: 'Terms of Service',
    description: 'The rules and guidelines for using Adieuu.',
    showInFooter: true,
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

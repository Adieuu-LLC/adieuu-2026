import type { LegalPolicySection } from '../LegalPolicyDocument';
import { LegalPolicyDocument } from '../LegalPolicyDocument';

const IDEA_SUBMISSION_TERMS_SECTIONS: LegalPolicySection[] = [
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
          These Idea Submission Terms (&quot;Idea Terms&quot;) govern your submission of feature
          requests, bug reports, improvements, and other feedback (&quot;Submissions&quot;) through
          Adieuu&apos;s community feedback board. By submitting feedback, you agree to these Idea
          Terms in addition to our{' '}
          <a href="/legal-policies/tos" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: 'public-visibility',
    title: 'Public Visibility',
    content: (
      <p>
        Submissions you post on the feedback board are publicly visible to authenticated Adieuu
        users. Do not include personal information, credentials, private conversation content, or
        other sensitive data in your submissions or attachments.
      </p>
    ),
  },
  {
    id: 'license',
    title: 'License Grant',
    content: (
      <>
        <p>
          By submitting feedback, you grant Adieuu a perpetual, worldwide, royalty-free, irrevocable
          license to use, reproduce, modify, adapt, publish, and incorporate your Submission (including
          any text, images, or attachments) into our products and services without obligation to you.
        </p>
        <p>
          You represent that you have the right to submit the content and that your Submission does
          not infringe any third-party intellectual property or other rights.
        </p>
      </>
    ),
  },
  {
    id: 'no-guarantee',
    title: 'No Guarantee of Implementation',
    content: (
      <p>
        Submitting feedback does not create any obligation for Adieuu to implement, prioritize, or
        respond to your Submission. We may use, modify, or decline Submissions at our sole discretion.
      </p>
    ),
  },
  {
    id: 'moderation',
    title: 'Moderation',
    content: (
      <p>
        All Submissions and attachments are subject to moderation, including automated content
        safety checks. We may remove Submissions that violate our Terms of Service, Acceptable Use
        Policy, or these Idea Terms, or that we determine are abusive, spam, or otherwise
        inappropriate.
      </p>
    ),
  },
];

interface ContentProps {
  highContrast?: boolean;
  onToggleHighContrast?: () => void;
}

export function IdeaSubmissionTermsContent({ highContrast, onToggleHighContrast }: ContentProps) {
  return (
    <LegalPolicyDocument
      sections={IDEA_SUBMISSION_TERMS_SECTIONS}
      highContrast={highContrast}
      onToggleHighContrast={onToggleHighContrast}
    />
  );
}

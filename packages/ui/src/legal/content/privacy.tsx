import { LegalPolicyDocument, type LegalPolicySection } from '../LegalPolicyDocument';

const PRIVACY_POLICY_SECTIONS: LegalPolicySection[] = [
  {
    id: 'information-we-collect',
    title: 'Information We Collect',
    content: (
      <>
        <p>
          This Privacy Policy document is a placeholder. The full policy will be published here
          before launch.
        </p>
        <p>
          This section will describe the categories of information Adieuu collects, including
          account identifiers, device information, and metadata necessary to operate the service.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-use-information',
    title: 'How We Use Information',
    content: (
      <p>
        We use collected information to provide, maintain, and improve Adieuu, to secure the
        platform, and to comply with legal obligations. We do not sell your personal information
        or use message content for advertising.
      </p>
    ),
  },
  {
    id: 'data-sharing',
    title: 'Data Sharing and Disclosure',
    content: (
      <p>
        This section will explain when we may share information with service providers, as required
        by law, or to protect the rights and safety of users. End-to-end encrypted message content
        is not accessible to Adieuu in readable form.
      </p>
    ),
  },
  {
    id: 'data-retention',
    title: 'Data Retention',
    content: (
      <p>
        We retain information only as long as necessary to provide the service and meet legal
        requirements. Specific retention periods for different data types will be documented here.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your Rights and Choices',
    content: (
      <>
        <p>
          Depending on your jurisdiction, you may have rights to access, correct, delete, or export
          your personal information.
        </p>
        <p>
          This section will describe how to exercise those rights and manage privacy settings within
          the app.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    content: (
      <p>
        Adieuu uses industry-standard encryption and security practices to protect your data.
        This section will summarize our technical and organizational safeguards and your role in
        keeping your account secure.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to This Policy',
    content: (
      <p>
        We may update this Privacy Policy from time to time. We will notify you of material changes
        through the service or by other appropriate means. The effective date of the current policy
        will be listed at the top of this page when published.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact Us',
    content: (
      <p>
        If you have questions about this Privacy Policy or our data practices, contact information
        will be provided here once the policy is finalized.
      </p>
    ),
  },
];

export function PrivacyPolicyContent() {
  return <LegalPolicyDocument sections={PRIVACY_POLICY_SECTIONS} />;
}

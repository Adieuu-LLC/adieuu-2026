import { LegalPolicyDocument, type LegalPolicySection } from '../LegalPolicyDocument';

const TERMS_OF_SERVICE_SECTIONS: LegalPolicySection[] = [
  {
    id: 'acceptance',
    title: 'Acceptance of Terms',
    content: (
      <>
        <p>
          This Terms of Service document is a placeholder. The full terms will be published here
          before launch.
        </p>
        <p>
          By accessing or using Adieuu, you agree to be bound by these Terms. If you do not agree,
          you may not use the service.
        </p>
      </>
    ),
  },
  {
    id: 'description-of-service',
    title: 'Description of Service',
    content: (
      <p>
        Adieuu provides end-to-end encrypted messaging and related communication features. This
        section will describe the scope of the service, supported platforms, and any limitations on
        availability or functionality.
      </p>
    ),
  },
  {
    id: 'user-accounts',
    title: 'User Accounts',
    content: (
      <>
        <p>
          You are responsible for maintaining the security of your account and for all activity
          that occurs under it.
        </p>
        <p>
          This section will outline account creation requirements, alias management, and your
          obligations regarding accurate account information.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable Use',
    content: (
      <p>
        You agree not to use Adieuu for unlawful purposes, harassment, spam, or activities that
        interfere with the service or other users. Detailed acceptable use rules will be provided
        here.
      </p>
    ),
  },
  {
    id: 'termination',
    title: 'Termination',
    content: (
      <p>
        We may suspend or terminate access to the service for violations of these Terms or where
        required by law. You may stop using the service at any time. This section will describe
        what happens to your data upon termination.
      </p>
    ),
  },
  {
    id: 'limitation-of-liability',
    title: 'Limitation of Liability',
    content: (
      <p>
        To the fullest extent permitted by applicable law, Adieuu and its operators will not be
        liable for indirect, incidental, or consequential damages arising from your use of the
        service. Full liability limitations will be set out in the final terms.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to These Terms',
    content: (
      <p>
        We may update these Terms from time to time. Material changes will be communicated through
        the service or by other appropriate means. Continued use after changes take effect
        constitutes acceptance of the revised Terms.
      </p>
    ),
  },
];

export function TermsOfServiceContent() {
  return <LegalPolicyDocument sections={TERMS_OF_SERVICE_SECTIONS} />;
}

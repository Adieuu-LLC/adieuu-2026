import { LegalPolicyDocument, type LegalPolicySection } from '../LegalPolicyDocument';

const TERMS_OF_SERVICE_SECTIONS: LegalPolicySection[] = [
  {
    id: 'intro',
    title: 'Intro',
    content: (
      <>
        <p>
          <strong>Effective:</strong> 15 June 2026<br />
          <strong>Last Updated:</strong> 15 June 2026<br />
        </p>
        <p>
          <strong>Welcome!</strong>&nbsp;
          Adieuu is a privacy-focused social platform that aims to make online conversation more human, accountable, and transparent without compromising on individual privacy. Please read these Terms of Service ("Terms") carefully, as they are a legally binding contract between you and us. They apply to your use of our services.
        </p>
        <p>
          As part of these Terms, you agree to comply with the most recent versions of our Privacy Policy, Acceptable Use Policy, Paid Services Terms, and other policies (as listed <a href='/legal-policies' rel='noreferrer'>here</a> or as otherwise made available to you), which are incorporated by reference into these Terms. If you use our services, or continue accessing or using the Services after being notified of a change to our Terms or any incorporated policies, you confirm that you have read, understand, and agree to be bound by these Terms and all incoporated policies.
        </p>
        <p>For Developers: If you use our APIs, SDKs, or our other developer services or software, additional policies may likely apply to that use.</p>
        <p>We've tried to make our policies as simple and clear as possible. If you have any questions or concerns, please don't hesitate to reach out to us at <a href='mailto:say@adieuu.com'>say@adieuu.com</a>.</p>
        <p>When we say "Adieuu", "we", "us", and "our" in these terms, we mean Adieuu, LLC, its subsidiaries, and its related companies.</p>
        <p>When we say "services" in these terms, we mean Adieuu's services, apps, websites, and other products.</p>
        <p>When we say "you" or "your" in these terms, we mean you. If you're accessing our services on behalf of a legal entity, you agree that you have the authority to bind that entity to these terms, and "you" and "your" will refer to that entity.</p>
        <h4>Modifications</h4>
        <p>We may make changes to these Terms as we grow for legal or regulatory reasons, to prevent abuse of our services, better protect or serve users of our services, or to better reflect changes to our service or business. If we make a material change to the Terms, we will do our best to provide you with reasonable advance notice either by emailing the email address associated with your account or by messaging you through our services (we may not be able to include advance notice for urgent changes).</p>
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

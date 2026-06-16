import type { LegalPolicySection } from '../LegalPolicyDocument';
import { LegalPolicyDocument } from '../LegalPolicyDocument';

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
          As part of these Terms, you agree to comply with the most recent versions of our <a href='/legal-policies/privacy' target='_blank' rel='noopener noreferrer'>Privacy Policy</a>, <a href='/legal-policies/acceptable-use' target='_blank' rel='noopener noreferrer'>Acceptable Use Policy</a>, <a href='/legal-policies/paid-services' target='_blank' rel='noopener noreferrer'>Paid Services Terms</a>, and other policies (as listed <a href='/legal-policies' target='_blank' rel='noopener noreferrer'>here</a> or as otherwise made available to you), which are incorporated by reference into these Terms. If you use our services, or continue accessing or using the Services after being notified of a change to our Terms or any incorporated policies, you confirm that you have read, understand, and agree to be bound by these Terms and all incoporated policies.
        </p>
        <p><strong>For Developers:</strong> If you use our APIs, SDKs, or our other developer services or software, additional policies may likely apply to that use.</p>
        <blockquote>
          <p>We've tried to make our policies as simple and clear as possible. If you have any questions or concerns, please don't hesitate to reach out to us at <a href='mailto:say@adieuu.com' rel='noopener noreferrer' target='_blank'>say@adieuu.com</a>. If you see behavior or content that is illegal, inappropriate, or otherwise violates our Terms, please report it by opening a support ticket through our services, or by emailing us directly at <a href='mailto:abuse@adieuu.com' rel='noopener noreferrer' target='_blank'>abuse@adieuu.com</a></p>
        </blockquote>
        <p>When we say "Adieuu", "we", "us", and "our" in these terms, we mean Adieuu, LLC, its subsidiaries, and its related companies.</p>
        <p>When we say "services" in these terms, we mean Adieuu's services, apps, websites, and other products.</p>
        <p>When we say "you" or "your" in these terms, we mean you. If you're accessing our services on behalf of a legal entity, you agree that you have the authority to bind that entity to these terms, and "you" and "your" will refer to that entity.</p>
        <h4>Modifications</h4>
        <p>We may make changes to these Terms as we grow for legal or regulatory reasons, to prevent abuse of our services, better protect or serve users of our services, or to better reflect changes to our service or business. If we make a material change to the Terms, we will do our best to provide you with reasonable advance notice either by emailing the email address associated with your account or by messaging you through our services (we may not be able to include advance notice for urgent changes).</p>
      </>
    ),
  },
  {
    id: 'about-adieuu-llc',
    title: 'About Adieuu, LLC',
    content: (
      <p>
        Adieuu, LLC is located at 1617 Park Place Ave Suite 110-AD, Fort Worth, TX 76110, USA. You can learn more about our company, our team, and our values at <a href='https://www.adieuu.org' target='_blank' rel='noopener noreferrer'>https://www.adieuu.org</a>.
      </p>
    ),
  },
  {
    id: 'age-requirements',
    title: 'Age Requirements',
    content: (
      <>
        <p>
          By accessing our services, you confirm that you're at least 18 years old and meet the minimum age required by the laws in your country and local jurisdiction. Adieuu's services are not designed for nor directed towards users under the age of 18. We may take additional steps, including the use of third-party services, to determine whether you are old enough to create an Adieuu account or access certain features or content.
        </p>
        <p>
          By creating an Adieuu account or using our services, you accept and agree to be bound by these terms and represent that you have reached the age of 18 or the age of majority (whichever is greater) where you live. We do not presently allow a parent or guardian to act on behalf of any individual under the age of 18.
        </p>
        <blockquote>
          <p>If we later offer our services to individuals under 18, it will be after we ensure we can provide reasonable protections for minors and with the consent of parents and/or guardians. We have concerns that many of the controls necessary to apropriately moderate content and manage safety for minors at scale may at times conflict with the privacy-focused protections we have in place for users today: we don't want to compromise on those protections, so we'll wait to support individuals under 18 until when we can find an appropriate solution.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'enforcement-and-indemnification',
    title: 'Enforcement and Indemnification',
    content: (
      <>
        <p>
          If we believe that there is a violation of these Terms, our Acceptable Use Policy, or any of our other policies that can be remedied by your removal of certain data or taking other action, we will, whenever we feel it most appropriate, ask you to take action rather than intervene. We may, instead or in addition, take what we determine to be appropriate action (including disabling, suspending, or permanently banning your account) if you do not take appropriate action or we believe there is a credible risk of harm to us, our services, or any third-parties.
        </p>
        <p>
          You will indemnify and hold Adieuu and its owners, officers, directors, employees, and agents harmless from and against any claims, liabilities, damages, and costs (including reasonable accounting and legal fees) related to (a) your access to or use of our services or third-party services, (b) your content, (c) your violation of these Terms, or (d) your negligence or willful misconduct.
        </p>
      </>
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

interface ContentProps {
  highContrast?: boolean;
  onToggleHighContrast?: () => void;
}

export function TermsOfServiceContent({ highContrast, onToggleHighContrast }: ContentProps) {
  return (
    <LegalPolicyDocument
      sections={TERMS_OF_SERVICE_SECTIONS}
      highContrast={highContrast}
      onToggleHighContrast={onToggleHighContrast}
    />
  );
}

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
          Adieuu is a privacy-focused social platform that aims to make online conversation more human, accountable, and transparent without compromising on individual privacy. Please read these Terms of Service ("Terms", "terms") carefully, as they are a legally binding contract between you and us. They apply to your use of our services.
        </p>
        <p>
          As part of these Terms, you agree to comply with the most recent versions of our <a href='/legal-policies/privacy' target='_blank' rel='noopener noreferrer'>Privacy Policy</a>, <a href='/legal-policies/acceptable-use' target='_blank' rel='noopener noreferrer'>Acceptable Use Policy</a>, <a href='/legal-policies/paid-services' target='_blank' rel='noopener noreferrer'>Paid Services Terms</a>, and other policies (as listed <a href='/legal-policies' target='_blank' rel='noopener noreferrer'>here</a> or as otherwise made available to you), which are incorporated by reference into these Terms. If you use our services, or continue accessing or using the Services after being notified of a change to our Terms or any incorporated policies, you confirm that you have read, understand, and agree to be bound by these Terms and all incoporated policies.
        </p>
        <p><strong>For Developers:</strong> If you use our APIs, SDKs, or our other developer services or software, additional policies may likely apply to that use.</p>
        <blockquote>
          <p>We've tried to make our policies as simple and clear as possible. If you have any questions or concerns, please don't hesitate to reach out to us at <a href='mailto:say@adieuu.com' rel='noopener noreferrer' target='_blank'>say@adieuu.com</a>. If you see behavior or content that is illegal, inappropriate, or otherwise violates our Terms, please report it by opening a support ticket through our services, or by emailing us directly at <a href='mailto:abuse@adieuu.com' rel='noopener noreferrer' target='_blank'>abuse@adieuu.com</a></p>
        </blockquote>

        <h5>Definitions</h5>
        <p>When we say "Adieuu", "we", "us", or "our" in these terms, we mean Adieuu, LLC, its subsidiaries, and its related companies.</p>
        <p>When we say "Services" or "services" in these terms, we mean Adieuu's services, apps, websites, and other products.</p>
        <p>When we say "User" or "Users" in these terms, we mean any person or entity that has signed up for an Adieuu account.</p>
        <p>When we say "you" or "your" in these terms, we mean you. If you're accessing our services on behalf of a legal entity, you agree that you have the authority to bind that entity to these terms, and "you" and "your" will refer to that entity.</p>
        <p>For your convenience, we may define the intended meaning of other words we use in the respective sections or policies in which they are first referenced.</p>
        <h4>Modifications</h4>
        <p>We may make changes to these Terms as we grow for legal or regulatory reasons, to prevent abuse of our services, to better protect or serve users of our services, or to better reflect changes to our service or business. If we make a material change to the Terms, we will do our best to provide you with reasonable advance notice either by emailing the email address associated with your account or by messaging you through our services (we may not be able to provide advance notice for urgent changes). Any material revisions to our Terms will become effective on the date set forth in our notice, and all other changes will become effective on the date we publish the change. If you use our services after the effective date of any changes, that use will constitute your acceptance of the revised terms and conditions.</p>
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
          By accessing our services, you confirm that you're human, that you're at least 18 years old or the age of majority in the jurisdiction you connect to our services from (whichever is greater), and that you meet the minimum age required by the laws in your country and local jurisdiction. Adieuu's services are not designed for nor directed towards users under the age of 18. We may take additional steps, including the use of third-party services, to determine whether you are old enough to create an Adieuu account or access certain features or content.
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
    id: 'general-provisions',
    title: 'General Provisions',
    content: (
      <>
        <blockquote>
          <p>This section gives us the flexibility we need to protect our rights and the platform. TLDR: we'll enforce these Terms the best we can, you can't assign your rights or obligations to someone else, and in the event of a merger, sale, etc we'll attempt to notify you beforehand so you can make the appropriate choices about your data.</p>
        </blockquote>
        <h4>Waiver</h4>
        <p>
          No failure or delay by either you or us in exercising any right under the Terms, including other incorporated policies, will constitute a waiver of that right. No waiver under the Terms will be effective unless made in writing and signed by an authorized representative of the party being deemed to have granted the waiver.
        </p>
        <h4>Severability</h4>
        <p>
          The Terms, including incorporated policies, will be enforced to the fullest extent permitted under applicable law. If any provision of the Terms is held by a court of competent jurisdiction to be contrary to law, the provision will be modified by the court and interpreted so as best to accomplish the objectives of the original provision to the fullest extent permitted by law, and the remaining provisions of the Terms will remain in effect.
        </p>
        <h4>Assignment</h4>
        <p>
          You may not assign any of your rights or delegate your obligations under these Terms, whether by operation of law or otherwise, without the prior written consent of us (not to be unreasonably witheld). We may assign these Terms in their entirety (including all terms and conditions incorporated in these Terms), without your consent, to a corporate affiliate or in connection with a merger, acquisition, corporate reorganization, or sale of all or substantially all of our assets. In such an event, we will attempt to provide advance notice you via our services and/or the contact information you've provided to us (such as your email).
        </p>
        <h4>Governing Law; Venue; Fees</h4>
        <p>
          Except where prohibited by law, these Terms and incorporated policies, and any disputes arising out of or related hereto, whether in arbitration or court, shall be governed by the laws of Texas and the United States, without regard to the conflicts of laws rules or the United Nations Convention on the International Sale of Goods. You hereby consent and submit to the exclusive jurisdiction of courts in the United States and Texas. In any action or proceeding to enforce rights under the Terms, Adieuu will be entitled to recover its reasonable costs and attorney's fees.
        </p>
        <h4>Entire Agreement</h4>
        <p>
          These Terms cover the entire agreement between you and Adieuu for your use of our services and supersede all prior and contemporaneous agreements, proposals, or representations, written or oral, concerning its subject matter. Where incorporated or referenced policies or pages, or additional terms, apply to our services, the additional terms will control with respect to your use of that service to the extent of any conflict with these Terms.
        </p>
        <h4>Submission of Legal and Abuse Notices</h4>
        <p>
          Notices to Adieuu should be sent to <a href='mailto:say@adieuu.com' target='_blank' rel='noopener noreferrer'>say@adieuu.com</a>, except for <strong>legal notices</strong> (which must be sent to <a href='mailto:legal@adieuu.com' target='_blank' rel='noopener noreferrer'>legal@adieuu.com</a>), <strong>security disclosures</strong> (which must be sent to <a href='mailto:security@adieuu.com' target='_blank' rel='noopener noreferrer'>security@adieuu.com</a> and filed and handled responsibly in accordance with our Security Practices), <strong>DMCA notices</strong> (which must be submitted in accordance with our DMCA policy to <a href='mailto:dmca@adieuu.com' target='_blank' rel='noopener noreferrer'>dmca@adieuu.com</a>), or <strong>abuse notices</strong> (which must be sent to <a href='mailto:abuse@adieuu.com' target='_blank' rel='noopener noreferrer'>abuse@adieuu.com</a> or otherwise submitted via the content reporting mechanisms provided in our services).
        </p>
        <p>When submitting any legal, DMCA, or platform abuse notice ("Notice") to Adieuu, you represent that you are authorized to act on behalf of the relevant rightsholder and that all information provided is accurate, truthful, and submitted in good faith. Please be advised that under applicable laws, including 17 U.S.C. § 512(f) of the Digital Millennium Copyright Act (DMCA), any person who knowingly materially misrepresents that material or activity is infringing, or that it was removed by mistake, may be subject to liability for significant damages, including costs and attorneys' fees incurred by Adieuu or our users.</p>
        <p>To be considered valid, a Notice must strictly comply with all applicable statutory requirements and Adieuu’s reporting procedures. Adieuu will not process Notices that are incomplete, unattributed, unverifiable, or that otherwise fail to meet legal standards. We reserve the right to take no action on deficient Notices and assume no obligation to notify the sender of such deficiencies or to request corrections. Furthermore, for Adieuu account holders, the repeated submission of false, frivolous, or bad-faith Notices constitutes a violation of these Terms and may result in the immediate suspension or termination of your account.</p>
        <blockquote>
          <p>TLDR: Don't submit fake or incomplete notices. We can't process them, and making false claims can result in legal consequences.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'user-generated-content',
    title: 'User Generated Content',
    content: (
      <>
        <p>When we say "Content", we mean all things added (uploaded, posted, streamed, shared, etc) by any Adieuu users including yourself to our Services. This includes text, GIFs, links, emoji, or files of any kind. This applies to any existing or future ways any Users including yourself may add content to our Services now or in the future.</p>
        <p>When we say "your Content", we mean specifically Content you added to our Services.</p>
        <p>No Users have any obligation to add Content to our Services. If any User, including you, should choose to add Content to our Services, the User is responsible for ensuring they have the right to do so, that the Content is lawful, and that they have the right to grant any necessary licenses (see 'Granted Licenses' below). We take no responsibility for any User's Content, including your own, and we are not responsible for anyone else's use of your Content.</p>
        <p>When we say "E2EE Content", we mean Content added by Users that is encrypted clientside with keys known only one or more User devices and in such a way that Adieuu backend systems are unable to discern the contents.</p>
        <p>When we say "Plaintext Content", we mean Content added by Users that is encrypted at rest or in transit but is not encrypted end to end (such that the contents of the Content may be visible or discernable to Adieuu backend services or our employees). A common example of this is Content posted in Spaces that is not E2EE Content (see below).</p>
        <p>When we say "Conversations", we mean areas in our services through which you communicate privately with one or more other Users, such that E2EE encryption is enabled by default and can not be disabled.</p>
        <p>When we say "Spaces", we mean small or large digital areas in our Services where one or more Users, perhaps including yourself, may add or access Content and where there may be Plaintext Content or E2EE Content, depending on the settings or configuration of the Space. The configuration and settings of a Space may be maintained by Users and may likely govern the encryption and privacy controls available around Content added to that Space. We attempt to make the encryption and privacy control configuration of a Space visible to you before viewing Content from or adding Content in that Space, but you are responsible for ensuring you know and understand the configuration of a Space before viewing or adding Content in the Space.</p>
        <p>When we say "Public Spaces", we mean Spaces configured by Users in such a way that Content added to the Space is directly or indirectly accessible to any User without end to end encryption.</p>
        <p>When we say "Recipient" or "Recipients", we mean any Users who may at any time now or in the future have access to your Content (for example, you add Content to a Conversation or Space where another User has access before, during, or after you add Content - that User is a Recipient).</p>
        <p>When we say "Adieu App", we mean Adieuu services and apps located in your browser or installed on your device where your Content is visible to your or your Recipients.</p>
        <p>When we say "Feedback", we mean Content you submit to our Services in support tickets, feature proposals (including but not limited to our "Timeline", "Roadmap", "Vote on Features", and "Submit Feedback" functionality in our Services), through product and feature roadmap calls (including but not limited to those provided as part of services or subscriptions you pay for), or through interactions of any kind with Adieuu employees or contractors. By sending us Feedback, you grant us a non-exclusive, perpetual, irrevocable, transferable license to use the Feedback or any ideas generated by the Feedback without any restrictions, attribution, or compensation to you.</p>
        <h4>Granted Licenses</h4>
        <p>All content in our Services is yours, but you give us a license to it when you use our Services. Your Content may be protected by certain intellectual property rights, which we do not own. The licenses you grant us may differ based on the outlined purposes of our service for your Content. All licenses granted to us by you are worldwide, non-exclusive, royalty-free, sublicensable, and transferable.</p>
        <p>To learn more about how we use your Content, please see our <a href='/legal-policies/privacy' target='_blank' rel='noopener noreferrer'>Privacy Policy</a>.</p>
        <h5>Granted Licenses for E2EE Content</h5>
        <p>When you add E2EE Content, you grant us all necessary rights and licenses for the purpose of providing our services to you and other Users and for storing, transmitting, and allowing for your and Recipients' continued access or your removal of your E2EE content (all of which is as permited by applicable law). The plaintext or decrypted contents of your E2EE Content is not visible to our backend services (meaning we can't read it), but is visible to you and your Recipients in the Adieuu app (so that you can view and interact with it). When you view your E2EE Content in the Adieuu app, or when Recipients view it in the Adieuu app, we may make the content interactable (for example, allowing a video to be played within the app instead of requiring an external video player or locally parsing it to award an achievement to your or a Recipient).</p>
        <p>When you add attachments (images, video, files, etc) as part of your E2EE Content, you have the option to enable content moderation. This is turned on by default, and may be turned off by toggling off the option prior to adding your E2EE Content. When enabled, we may upload a temporary copy ("Moderation Copy") of the contents of the message and its attachments to our backend Services for the purpose of content moderation. The message and attachments are automatically scanned for child sexual abuse material ("CSAM").</p>
        <p>For the outlined purposes in this Granted Licenses for E2EE Content section (as well as any additional limited purposes not listed but reasonably inferred as to be supportive of the outlined purposes), you grant us license to use, reproduce, distribute, create derivative works of, display, and perform your E2EE Content. We do not use (and are unable to use) your E2EE Content to improve our services.</p>

        <h5>Granted Licenses for Plaintext Content</h5>
        <p>When you add Plaintext Content, you grant us all necessary rights and licenses for the purposes of providing, developing, and improving our services as permitted by applicable laws. Plaintext Content may be used to improve our services. Plaintext Content is never sold by Adieuu to any third-parties.</p>

        <h5>Other Content</h5>
        <p>Content by Other Users</p>
        <p>Our services may provide you with access to content added by other Users ("Others' Content"). You may not use Others' Content without their consent, or as allowed by law. Others Content is their own and does not reflect Adieuu's views, or the views of Adieuu staff. Adieuu does not endorse or verify the accuracy of Others' Content. You may likely see Others' Content that you find offensive or objectionable: if you don't, you're probably building your own echo chamber. In any case, you agree Adieuu is in no way liable for Others' Content or any harm caused by Others' Content. You may report any content you find objectionable via the reporting function provided in our services or by emailing <a href='mailto:say@adieuu.com' rel='noopener noreferrer' target='_blank'>say@adieuu.com</a>. We retain the right, but have no obligation, to review your reports of Others' Content and we may block or remove content at our discretion. Please see our section in these Terms on "Submission of Legal and Abuse Notices": reporting Others' Content simply because you do not like it is not considered valid and may be considered a bad-faith Notice.</p>
        <p>Our services may provide you with access to content that contains links to or access to third-party content (such as websites, features, apps, or other content). We are not responsible for any third-party content or services.</p>
      </>
    ),
  },
  {
    id: 'accessing-adieuu-your-account',
    title: 'Accessing Adieuu; Your Account',
    content: (
      <>
        <p>
          Others' Content may sometimes be made available to you without requiring an Adieuu account ("Account"). For example, in Public Spaces or in the Feedback or "Vote on Features" sections of the app. In other cases, in order to access Others' Content or otherwise non-public portions of our services on an ongoing basis, you will need to create an Adieuu account. You may provide a valid email address or phone number you own or have license to use. You may be required to verify your continued access to your chosen authentication methods periodically or during login. In some cases, you may be required to provide additional information.
        </p>
        <p>Adieuu does not intend to serve anyone under the age of 18 or the age of majority in your jurisdiction (whichever is greater). To this end, depending on jurisdiction requirements, we may require additional steps to verify your age. We always use the least invasive method legally available to you and our services (for example, in many jurisdictions, a credit card is sufficient proof of age and thus subscribing to Adieuu is sufficient proof of age), and none of your Account information (including age data) is linked to your messages, posts, or other activity on our services. See our policies and learning materials on Aliases to learn more about how this works - we've put a lot of thought and effort into ensuring your Account and Alias are distinct, separate, and unlinkable entities so that we can guarantee your privacy (and that you're human) while maintaining legal compliance.</p>
        <p>
          You are responsible for the security of your Account
        </p>
      </>
    ),
  },
  {
    id: 'adieuu-content',
    title: 'Adieuu Content',
    content: (
      <>
        <p>
          Our services include some content that belongs to use, such as the design of our services, content written by us, and our images, art and other media. You may only use our trademarks, branding markings or material, or copyrights as permitted in prior written writing to you on a case by case basis (or, later, as permitted in any Branding Guidelines we may choose to publish for your convenience). You may use our services as outlined in these Terms, and acknowledge that we retain all intellectual property rights in our content.
        </p>
      </>
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

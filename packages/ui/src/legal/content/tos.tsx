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
        <h4>Services "As Is" and Feature Availability</h4>
        <p>We provide our services to a global audience: as such, certain features, settings, and functionality may have different defaults, settings, or being completely unavailable depending on the local jurisdiction you connect from. We do our best to keep any of our services high-quality and accessible online, but at this time we can not make any guarantees that we will be free of interruptions or include any minimum levels of quality (which may also depend on factors beyond our control, such as the quality of your internet service and equipment).</p>
        <p>To the fullest extent permitted by law, Adieuu makes no warranties, either express or implied, about our Services. <strong>The Services are provided "as is"</strong>. We further disclaim any implied warranties of fitness for a particular purpose, non-infringment, merchantability, and quiet enjoyment, and any warranties arising out of the course of usage or trade or dealing. To the extent that certain jurisdictions do not alow limitations on implied warranties, and to the further extent such warranties can not be disclaimed under the laws of your jurisdiction, we limit the duration and remedies of such warranties to the full extent permissible under those laws.</p>
        <blockquote>
          <p>tldr; We provide Adieuu Services "as is". As an aside, for your convenience, we provide a service status monitoring page at <a href='https://status.adieuu.com' target='_blank' rel='noopener noreferrer'>status.adieuu.com</a>.</p>
        </blockquote>
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
          You may not assign any of your rights or delegate your obligations under these Terms, whether by operation of law or otherwise, without the prior written consent of us (not to be unreasonably witheld). We may assign these Terms in their entirety (including all terms and conditions incorporated in these Terms), without your consent, to a corporate affiliate or in connection with a merger, acquisition, corporate reorganization, or sale of all or substantially all of our assets. In such an event, we will attempt to provide advance notice you via our services and/or the contact information you've provided to us (such as your email address).
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
        <p>To be considered valid, a Notice must strictly comply with all applicable statutory requirements and Adieuu's reporting procedures. Adieuu will not process Notices that are incomplete, unattributed, unverifiable, or that otherwise fail to meet legal standards. We reserve the right to take no action on deficient Notices and assume no obligation to notify the sender of such deficiencies or to request corrections. Furthermore, for Adieuu account holders, the repeated submission of false, frivolous, or bad-faith Notices constitutes a violation of these Terms and may result in the immediate suspension or termination of your account.</p>
        <blockquote>
          <p>TLDR: Don't submit fake or incomplete notices. We can't process them, and making false claims can result in legal consequences.</p>
        </blockquote>
        <h4>Appeals</h4>
        <p>We provide as much transparency as we can on our decisions, including those made related to enforcement of our Terms. Please see our Acceptable Use Policy for more information about how we handle reports and enforcement actions. In any case, you may appeal most enforcement actions we take (actions related to illegal content, such as CSAM, may not be appealed and such reports are forwarded to federal authorities where applicable). Appeals may be submitted through <a href='mailto:iminnocent@adieuu.com' target='_blank' rel='noopener noreferrer'>iminnocent@adieuu.com</a></p>
        <h4>Use At Your Own Risk</h4>
        <p>Any information presented on or through our Services is made available solely for informational purposes. We do not confirm the accuracy, usefulness, or completeness of the information. Any reliance you place on such information is solely at your own risk.</p>
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
        <p>When we say "Feedback", we mean Content you submit to our Services in support tickets, feature proposals (including but not limited to our "Timeline", "Roadmap", "Vote on Features", and "Submit Feedback" functionality in our Services), through product and feature roadmap calls (including but not limited to those provided as part of services or subscriptions you pay for), through comments or pull requests on our code repositories, or through interactions of any kind with Adieuu employees or contractors. By sending us Feedback, you grant us a non-exclusive, perpetual, irrevocable, transferable license to use the Feedback or any ideas generated by the Feedback without any restrictions, attribution, or compensation to you.</p>
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
        <p>Content by Third-Parties</p>
        <p>Our services may provide you with access to content that contains links to or access to third-party content (such as websites, features, apps, or other content). We are not responsible for any third-party content or services. An example of this is is GIFs and Stickers from a third-party provider (like Klipy).</p>
      </>
    ),
  },
  {
    id: 'accessing-adieuu-your-account',
    title: 'Accessing Adieuu; Your Account',
    content: (
      <>
        <p>We we say "Account", we mean an Adieuu account attached to your email address or phone number.</p>
        <p>We we say "Alias", we mean a digital username or persona through which you message, post, or otherwise act or engage with our services, other Users, and Others' Content. You must have an Account to create or access an Alias, and each Account may only have a limited number of Aliases it can access. Access to an Alias is one-way: you can sign into an Alias from an Account, but you can not sign into an Account from an Alias (by design and for privacy, it is not possible to derive the source Account from an Alias). An Alias may have identifiers like a username, display name, profile, vanity URL, etc that you may customize and which are not required to have any relation or resemblance to your Account.</p>
        <p>
          Others' Content may sometimes be made available to you without requiring an Adieuu account ("Account"). For example, in Public Spaces or in the Feedback or "Vote on Features" sections of the app. In other cases, in order to access Others' Content or otherwise non-public portions of our services on an ongoing basis, you will need to create an Adieuu account. You may provide a valid email address or phone number you own or have license to use. You may be required to verify your continued access to your chosen authentication methods periodically or during login. In some cases, you may be required to provide additional information.
        </p>
        <p>Adieuu does not intend to serve anyone under the age of 18 or the age of majority in your jurisdiction (whichever is greater). To this end, depending on jurisdiction requirements, we may require additional steps to verify your age. We always use the least invasive method legally available to you and our services (for example, in many jurisdictions, a credit card is sufficient proof of age and thus subscribing to Adieuu is sufficient proof of age), and none of your Account information (including age data) is linked to your messages, posts, or other activity on our services. See our policies and learning materials on Aliases to learn more about how this works - we've put a lot of thought and effort into ensuring your Account and Alias are distinct, separate, and unlinkable entities so that we can guarantee your privacy (and that you're human) while maintaining legal compliance.</p>
        <p>You agree not to license, sell, lend, transfer, or otherwise assign to another entity your Account, Alias without our prior written approval. We reserve the right to delete, change, or reclaim your Alias identifiers at our discretion (including but not limited to situations where your Alias identifiers violate our Terms or other policies).</p>
        <p>
          Humans, not code, are the weakest link in modern cybersecurity: most incidents across any online service are a combination of phishing and lack of appropriate care by people for their online accounts. <strong>You are responsible for the security of your Account and Alias</strong> on Adieuu. We invest significant time and resources into providing you with the tools necessary to sufficiently protect your Account, including but not limited to multi-factor authentication ("MFA", via both virtual and hardware devices), account notifications, etc.
        </p>
        <p>You agree to notify us immediately (by opening a support ticket through our services, or by emailing us directly at <a href='mailto:say@adieuu.com' rel='noopener noreferrer' target='_blank'>say@adieuu.com</a>) if ou believe your account has been compromised.</p>
        <h5>Discounts for Using MFA</h5>
        <p><strong>We very strongly recommend enabling MFA on your account</strong>, separate from or in addition to any MFA you may have enabled on your email provider. Hardware-based MFA (such as via a Yubikey) is generally regarded as one of the strongest methods, as it requires the presence of a physical device (meaning an attacker must both physically steal your hardware key and infiltrate your email or phone number in order to sign in as you). Improving your own security is one of many steps necessary to protect your privacy.</p>
        <p>We offer a 2% discount on subscriptions when you have any form of MFA enabled on your Account. When you enable hardware-based MFA on your Account, we offer an additional 3% (subtotal of 5%) on all subscriptions, and extend the discount to apply to all purchases you make with the Account.</p>
        <p>Obligation of Account Accuracy</p>
        <p>You must always provide accurate information related to your Account to Adieuu and maintain the accuracy of such information. We may assume that any communications we've received from your Account or the associated contact information (such as email address or phone number) have been made by you. We may assume that any actions taken by your Account, including purchases, were made by you.</p>
        <p>If you become locked out of your account due to compromise, rate limiting, or other security mechanisms enabled in our services, we'll need to contact you at the email address or phone number associated with your account. In any case (including but not limited to account compromise), we may not be able to restore your access to your Account or Aliases.</p>
        <h5>Safeguarding Alias Access</h5>
        <p>In order to create or access your Alias, you must provide a password after signing into your Account. We use a combination of entropy derived from your anonymized Account metadata and the password you provide to find and authenticate you into your Alias. If you create multiple Aliases, each Alias must have a unique password. It is your responsibility to use sufficiently strong and unique passwords, and we strongly recommend you avoid reusing passwords you've previously used in other services.</p> 
        <blockquote>Pro Tip: Size <strong>does</strong> matter. The longer your password, the better: bad actors use automated tools to check every possible combination of characters, so every additional character you add exponentially increases the time required to crack it. An easy to remember phrase, complete with punctuation, is incredibly secure (example: "Life is like a box of moldy chocolates!"), and often is a lot easier to remember than a bunch of random letters and symbols.</blockquote>
        <p><strong>If you lose access to one of your Aliases, we are unable to help you restore it.</strong> We plan to introduce optional backup methods in the future, but those are not yet offered in our services. You should keep a copy of your Alias password in a safe place (like a password manager or file cabinet). As long as you know your current Alias password, you can change your Alias password at any time while signed into your Account. You are unable to change an Alias password while signed into an Alias (you'll need to sign out and sign back into your Account).</p>
      </>
    ),
  },
  {
    id: 'adieuu-content',
    title: 'Adieuu Content',
    content: (
      <>
        <p>
          Our services include some content that belongs to us, such as the design of our services, content written by us, and our images, art and other media. You may only use our trademarks, branding markings or material, or copyrights as permitted in prior written writing to you on a case by case basis (or as permitted in any Branding Guidelines we may later choose to publish for your convenience). You may use our services as outlined in these Terms, and acknowledge that we retain all intellectual property rights in our content.
        </p>
      </>
    ),
  },
  {
    id: 'adieuu-software',
    title: 'Adieuu Software',
    content: (
      <>
        <h5>License to Our Software</h5>
        <p>
         Some of our Services allow you to download client software. We grant you a worldwide, non-exlusive, personal, non-tranferable, non-sublicensable, and non-assignable license to download, install, and run software provided by our Services, for as long as you maintain an Adieuu account and comply with these Terms. You may not copy, modify, create derivative works based upon, distribute, sell, lease, or sublicense any of our software or services. You may not reverse engineer or decompile our software or services, or attempt to do so (or assist anyone else in doing so), unless you have our prior written consent.
        </p>
        <h5>Included Open Source Software</h5>
        <p>Some Adieuu services include software subject to separate open source license terms, and your use of such services are subject to your compliance with applicable license terms. We encourage you to review our <a href='/legal-policies/open-source-license-terms' target='_blank' rel='noopener noreferrer'>Open Source License Terms</a>, as some licenses may explicitly override these terms.</p>
        <h5>Adieuu Source Code and Transparency</h5>
        <p>We strongly believe in transparency: we care about your privacy, and you should be able to independently verify our authenticity. We provide access to source control repositories of some or all of our codebase, with the intent to allow for independent, read-only analysis of our codebase and for the purpose of allowing you to independently self-host the Adieuu platform on your own infrastructure. The relevant repositories may have addiitional licenses and usage requirements that apply in addition to these Terms. Except where otherwise explicitly listed in our code repositories (for example, in the referenced repository-specific licenses), Adieuu code may not be used in your own projects (commercial or otherwise), nor may it be redistributed with the intent to be available for use in others' projects. You may self-host our code in your own infrastructure as long as you maintain attribution to Adieuu and do not charge for any part of the self-hosted service. We reserve the right to request you take down any self-hosted instances of Adieuu code that you control, at our sole discretion, and you agree to comply with our request within 48 hours upon us issuing notice. You are responsible for ensuring your contact information is readily available and accessible for the timely reciept of such notices. Self-hosted instances of Adieuu code must be hosted as-is, without any code changes (aside from general configuration variables for use in Terraform, Node environments, etc). If there are bugs or issues you would like to address, you may submit pull requests to our repositories for our review, or submit Feedback via our Services.</p>
          
        <blockquote>
          <p>Full source code and self-hosting license and usage information and requirements are available in the appropriate repositories at <a href='https://www.github.com/adieuu-llc' target='_blank' rel='noopener noreferrer'>our Github</a>.</p>
        </blockquote>

        <h5>Third-Party Services</h5>
        <p>We may allow you to access other products, features, or services developed by third-parties (such as integrations for Spaces or the incorporation of Adieuu capabilities into other features, applications, or services). Any such third-party providers are required to adhere to these Terms (in addition to some other terms and policies they're made aware of), but you acknowledge and agree that Adieuu is not responsible for any third-party services. Adieuu does not warrant or endorse, or have any liability for, any third-party services or your use therein. If you believe a third-party provider has violated our Terms or is otherwise acting in an abusive capacity, you can report via the ticketing function in our services, or via <a href='mailto:abuse@adieuu.com' rel='noopener noreferrer' target='_blank'>abuse@adieuu.com</a>. We have no obligation, but retain the right, to review such reports and take actions at our discretion.</p>
      </>
    ),
  },
  {
    id: 'adieuu-paid-services',
    title: 'Adieuu Paid Services',
    content: (
      <>
        <h5>Why Isn't Adieuu Free?</h5>
        <p>
          Read-only access to public content is generally available for free (where applicable law allows). However, servers and networking infrastructure cost money (even when not being used), as does running a business. Even just existing as a legal business entity, without revenue, has costs! Our biggest cost is bandwidth: every time you send or receive a message, especially images and video, that uses bandwidth. You might think of bandwidth as being akin to gas in a car, and our servers a storage facility: the more often you travel to our facility, and the larger each load you transport is, the more gas is used. Similarly, the more you use our platform and the bigger the data you send (videos, for example, are often thousands or millions times the size of a single image or message text), the higher our costs. Plus, the more you and others send, the more we have to store (unless you delete it, of course): meaning our storage costs are always increasing over time.
        </p>
        <p>All this to say - we have to have some way of paying for our technical and business costs. We don't sell your data, and we don't serve external third-party advertisements (we have no plans to do so). We need to ensure we can continue to deliver our services to you and others at a high degree of quality (and to continue to grow and improve our services). To this end, we offer annual subscriptions (in addition to some limited one-time purchase options that provide a lifetime subscription) that are specifically priced to be as low as possible to you while covering our costs enough to enable us to maintain and grow our services.</p>
        <p>If you're interested in more of the thought process behind our pricing and monetization strategy, we encourage you to browse our <a href='/about/learn#pricing' target='_blank' rel='noopener noreferrer'>Learning Area</a> to find out more, or ask us any questions you'd like at <a href='mailto:say@adieuu.com' rel='noopener noreferrer' target='_blank'>say@adieuu.com</a>. </p>
        <h5>Paid Service Terms</h5>
        <p>Our <a href='/legal-policies/paid-services-terms' target='_blank' rel='noopener noreferrer'>Paid Services Terms</a> apply to any purchase you make using our supported purchase flows.</p>
      </>
    ),
  },
  {
    id: 'termination-and-survival',
    title: 'Termination, Survival',
    content: (
      <>
        <p>
         You may stop using our services at any time, for any reason. You may terminate this agreement by removing your Account through your settings in the Adieuu app, or by emailing us at <a href='mailto:say@adieuu.com' rel='noopener noreferrer' target='_blank'>say@adieuu.com</a>, and discontinuing use of our services. Note that, due to the cryptogrographic relationship between your Account and your Aliases, deleting your account will permanently remove any access to your Alias (and there is no way for us to access your Aliases on your behalf or verify your ownership). You are solely responsible for removing all of your Content from your Aliases prior to deleting your Account: Adieuu has no responsibility or liability arising from your failure to remove your Content. You can do this individually for each piece of your Content, or via your Account settings (you must know your Alias password in order to do so). Deleting an Alias is irreversible, and Accounts are only provided with a limited number of Aliases. Deleting one or more of your Aliases does not entitle you to additional Aliases. Certain provisions of these terms will survive termination, as outlined below.
        </p>
        <p>We reserve the right to suspend or terminate your Aliases, your Account, and/or your access to some or all Services, <strong>at our discretion</strong>, with or without notice, and subject to applicable law. Our reserved right to suspension or termination remains at our discretion, but must be for one of the following reasons:</p>
        <ul>
          <li>You breach these Terms (or any additional terms or policies, either referenced or that you were made aware of prior to the breach),</li>
          <li>You encourage or assist others in breaching these Terms (or any additional terms or policies, either referenced or that you were made aware of prior to the breach),</li>
          <li>You connect to our Services from a geolocation that we have blocked or from which we have otherwise prohibited use of our Services,</li>
          <li>We believe suspension or termination is necessary to prevent harm to you, us, Users, or third-parties,</li>
          <li>We're required to do so to comply with a legal requirement or court order,</li>
          <li>or your continued use or access of our Services, including but not limited to hosting your Content, creates irremediable risk to you, us, or Users.</li>
        </ul>
        <p>In all cases, we will attempt to provide advance notice to you (where it's reasonable to do so, and where we are not prevented from doing so by applicable law).</p>
        <h4>Survival</h4>
        <p>As permitted under applicable law, any part of these Terms that by their nature should reasonably survive after termination (either by you or us) of these Terms will survive. This includes but may not be limited to:</p>
        <ul>
          <li>Any disclaimer of warranties, such as those under the Services 'Services "As Is" and Feature Availability' section;</li>
          <li>Any applicable limitation of liability, such as those noted throughout these Terms, and under the under the 'Limitation of Liability' section;</li>
          <li>Any indemnification obligations (where applicable), including but not limited to those under the "Enforcement and Indemnification" section;</li>
          <li>Any amounts owed shall remain due;</li>
          <li>Our rights to retain and display certain data for the protection of our Users and Services, including as outlined in our <a href='/legal-policies/privacy' target='_blank' rel='noopener noreferrer'>Privacy Policy</a>.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'limitation-of-liability',
    title: 'Limitation of Liability',
    content: (
      <>
        <p>
         Your consumer rights that can not be waived or limited by any contract or agreement are not effected by the provisions in this section.
        </p>
        <p>
         We do not exclude or limit our liability to you where it would be illegal for us to do so. In jurisdictions where the types of exclusions in this section are not allowed, we are only responsible to you for losses and damages that are a forseeable result of our failure to use reasonable skill and care or our material breach of our contract with you. To the extent permitted by applicable law, our liability is limited (at our option) to the replacement, repair or resupply of the Services or the pro-rata refund to you of prepaid fees for your subscription covering the remainder of your term.
        </p>
        <p>Adieuu is not liable for the content or conduct of any Users, whether online or offline.</p>
        <p>In jurisdictions where exclusions or limitations of liability are allowed, to the maximum extent permitted by applicable law, Adieuu will in no event have any liability to you for any lost profits or revenues, loss of data or goodwill, service interruptions, computer failure or damage, or for any indirect, exemplary, special, consequential, incidental, punitive or cover damages however caused, whether in contract, tort, or under any theory of liability, and whether or not the party has been advised of the possibility of such damages. Our maximum aggregate liability to you for any breach of these Terms is one hundred dollars ($100) in the aggregate. No disclaimers or provisions in these Terms shall limit our right to seek and obtain equitable relief.</p>
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

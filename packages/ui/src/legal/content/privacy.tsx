import type { LegalPolicySection } from '../LegalPolicyDocument';
import { LegalPolicyDocument } from '../LegalPolicyDocument';

const PRIVACY_POLICY_SECTIONS: LegalPolicySection[] = [
  {
    id: 'intro',
    title: 'Introduction',
    content: (
      <>
        <p>
          <strong>Effective:</strong> 23 June 2026<br />
          <strong>Last Updated:</strong> 23 June 2026
        </p>
        <p>
          This Privacy Policy explains how Adieuu, LLC ("Adieuu", "we", "us", or "our") collects, uses, shares, and protects information when you use our services, apps, websites, and other products (collectively, "Services"). It is incorporated into and forms part of our{' '}
          <a href="/legal-policies/tos" target="_blank" rel="noopener noreferrer">Terms of Service</a>. Capitalized terms used in this policy (such as "E2EE Content", "Plaintext Content", "Spaces", "Conversations", and "Recipients") have the meanings defined in our Terms of Service unless otherwise noted here.
        </p>
        <p>
          Adieuu is a privacy-focused platform. Our architecture is designed around a fundamental principle: <strong>your identity and your activity are separate and can't be linked to each other</strong>. Your Account (your private identity) is cryptographically separated from your Aliases (how you speak or act on the platform). This separation is not a feature layered on top: it is the foundation our entire system is built upon, and it gives us structural privacy advantages that no other social platform can offer today.
        </p>
        <p>
          This relationship is strictly one-way: your Account derives entropy that, combined with a password you provide, is used to locate and authenticate into an Alias. Given only an Alias (or even access to the entire database), it is not possible to trace it back to its source Account. This means that activity on an Alias (your messages, posts, and interactions) is not linkable to the private information on your Account (your email, payment details, etc). For example, when your jurisdiction requires age verification, that verification lives on your Account, but because no one can work backwards from your Alias to find it, compliance with age verification laws does not come at the cost of a deanonymization risk. We believe no other social platform can make this claim today, and we're excited to be the first to demonstrate its potential.
        </p>
        <blockquote>
          <p>We built Adieuu such that privacy isn't a setting you toggle: it's the foundation of our systems. Your Account knows who you are; your Aliases don't have any ability to discern who you are (and thus neither do we). On other platforms, your identity and your activity live on the same account. They're connected by default, and "privacy" means trusting the platform not to exploit that connection. On Adieuu, identity and activity are architecturally separate. We didn't choose not to link them in our database; we <em>can't</em>. This policy explains exactly what we know, what we can't know, why, and then how any information you provide is used.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'account-alias-architecture',
    title: 'The Account/Alias Architecture',
    content: (
      <>
        <p>Understanding how we handle your data requires understanding how our platform is structured. Adieuu separates your presence on the platform into two distinct layers:</p>
        <h4>Your Account</h4>
        <p>Your Account is your private identity on Adieuu. It contains:</p>
        <ul>
          <li>Your email address or phone number (used for authentication and critical notices);</li>
          <li>Your payment and billing information (managed by Stripe; we do not store full card details);</li>
          <li>Your age verification status (pass/fail only, not your age, identity documents, or biometric data);</li>
          <li>Your jurisdiction (derived from your connection, used for legal compliance);</li>
          <li>Security settings (MFA configuration, login history, session management);</li>
          <li>Account-level preferences and configuration.</li>
        </ul>
        <h4>Your Aliases</h4>
        <p>Your Aliases are how you act on Adieuu: your usernames, profiles, messages, and interactions. They are cryptographically separated from your Account:</p>
        <ul>
          <li>You sign into an Alias <em>from</em> your Account (using a password known only to you), but your Alias cannot be traced back to your Account;</li>
          <li>We cannot derive which Account owns a given Alias (this is by design, not by policy);</li>
          <li>Alias data includes: display name, username, profile information, Plaintext Content, interaction metadata within Spaces and Conversations;</li>
          <li>Enforcement actions are applied at the Alias level because we are technically unable to link them to Accounts.</li>
        </ul>
        <p>This separation means that even if someone (including Adieuu staff, a court order, or a data breach) obtains your Alias data, there is no path through our systems to connect it to your real identity. Conversely, since activity is tied to Alias, your Account data does not reveal what you've said or done on the platform.</p>
        <blockquote>
          <p>No system is immune to breach. We built ours assuming one will eventually happen, and designed the architecture so that a breach of any single layer exposes as little as possible. An attacker who compromises Alias data cannot trace it back to an Account. An attacker who compromises Account data cannot determine which Aliases belong to it without knowing your password. An attacker who compromises our message storage gets ciphertext encrypted with keys that only exist on your device. The only realistic path to connecting your identity and activity would require simultaneous compromise of our entire infrastructure <em>or</em> source code (the latter of which is publicly auditable).</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'information-we-collect',
    title: 'Information We Collect',
    content: (
      <>
        <p>We collect different categories of information depending on how you interact with our Services. We are transparent about what falls into each category because our architecture makes some categories structurally inaccessible to us.</p>

        <h4>Information You Provide</h4>
        <h5>Account Information</h5>
        <ul>
          <li>Email address or phone number (required for account creation and authentication);</li>
          <li>Account password (stored as a cryptographic hash; we cannot read it);</li>
          <li>Multi-factor authentication configuration (device registrations, recovery codes);</li>
          <li>Billing information (subscription status, purchase history, payment method metadata). Full card details are held by Stripe, not us.</li>
        </ul>

        <h5>Alias Information</h5>
        <ul>
          <li>Alias password (used in combination with anonymized Account entropy to derive Alias access; stored as a cryptographic hash);</li>
          <li>Display name, username, vanity URL, and profile information you choose to set;</li>
          <li>Plaintext Content you post in Spaces or other non-E2EE areas;</li>
          <li>E2EE Content you send in Conversations (encrypted with keys known only to participant devices; we store the ciphertext but cannot read it);</li>
          <li>Moderation Copies of E2EE Content attachments (temporary, used only for automated CSAM hash-matching when you have content moderation enabled, then deleted).</li>
        </ul>

        <h5>Feedback and Support</h5>
        <ul>
          <li>Support tickets, bug reports, and other communications you send us;</li>
          <li>Feature proposals, roadmap feedback, and product call participation;</li>
          <li>Abuse reports and DMCA notices you submit.</li>
        </ul>

        <h4>Information Collected Automatically</h4>
        <ul>
          <li><strong>Connection metadata:</strong> IP address, approximate geographic location (used for jurisdiction determination and security), connection timestamps;</li>
          <li><strong>Device information:</strong> browser type, operating system, device type, and screen resolution (used to deliver and optimize the service);</li>
          <li><strong>Usage data:</strong> features accessed, interactions with UI elements, errors encountered (used to maintain and improve the service). This data is associated with your session, not with your Alias activity or content;</li>
          <li><strong>Security events:</strong> login attempts, MFA challenges, password changes, and session activity (used to protect your Account).</li>
        </ul>

        <h4>Information from Third Parties</h4>
        <ul>
          <li><strong>Stripe:</strong> Payment confirmation, subscription status, and transaction identifiers. We do not receive or store your full card number, CVV, or bank account credentials;</li>
          <li><strong>VerifyMy (age verification):</strong> We deliberately chose an age verification provider that returns the absolute minimum to us: a pass/fail result and the jurisdiction associated with the verification. We do not receive your age, date of birth, identity documents, biometric data, or any other personal information you submit to VerifyMy (not even your actual age). When we asked (as a test) VerifyMy to modify their endpoints to return more data to us (as a customer or partner of theirs): they declined to do so. This gives us confidence in their commitment to your privacy, and we appreciate them as a partner. When verification is required, we always seek the least invasive method available in your jurisdiction. In the event of a breach of VerifyMy, they would still only be able to connect you to an Adieuu Account (not an Alias), and we're pursuing methods that would make even that connection difficult or impossible. Their processing of your data is governed by their own privacy policy, presented to you at the time of verification;</li>
          <li><strong>GIF/Sticker providers (e.g., Klipy):</strong> Content you request is served through their systems. We do not share your identity with these providers, though your device may connect to their servers to load media. You can turn off GIFs and Stickers entirely through your Appearance settings, or enable/disable them for specific Conversations.</li>
        </ul>

        <h4>Information We Do Not Collect</h4>
        <p>For clarity, we do not collect:</p>
        <ul>
          <li>Your real name (unless you choose to use it in an Alias profile);</li>
          <li>Your physical address;</li>
          <li>Your date of birth or exact age;</li>
          <li>Identity documents or biometric data;</li>
          <li>The plaintext content of your E2EE messages (we are technically unable to access it);</li>
          <li>Social media profiles or contacts from other services;</li>
          <li>Location data beyond what is derivable from your IP address for jurisdiction purposes.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-use-information',
    title: 'How We Use Your Information',
    content: (
      <>
        <p>How we use your information depends on which layer it belongs to and what type of content it is.</p>

        <h4>Account Information</h4>
        <p>We use Account information to:</p>
        <ul>
          <li>Authenticate you and maintain your session;</li>
          <li>Process payments and manage your subscription;</li>
          <li>Send critical communications (security alerts, billing notices, legal notices, and policy updates);</li>
          <li>Determine your jurisdiction for legal compliance (age verification requirements, geofencing);</li>
          <li>Detect and prevent fraud, unauthorized access, and abuse;</li>
          <li>Respond to your support requests;</li>
          <li>Comply with legal obligations.</li>
        </ul>

        <h4>Alias Information and Content</h4>
        <h5>E2EE Content</h5>
        <p>We use E2EE Content solely to:</p>
        <ul>
          <li>Store and transmit encrypted ciphertext so you and your Recipients can access it;</li>
          <li>Process temporary Moderation Copies through automated CSAM hash-matching (only when content moderation is enabled by you or the Space you are adding Content to), then delete the Moderation Copy.</li>
        </ul>
        <p>We do not (and cannot) use E2EE Content to improve our services, train models, analyze trends, or for any purpose other than delivery and the limited moderation described above.</p>

        <h5>Plaintext Content</h5>
        <p>We use Plaintext Content to:</p>
        <ul>
          <li>Deliver it to you and Recipients in Spaces;</li>
          <li>Improve our Services (for example, understanding usage patterns in Spaces to improve the product);</li>
          <li>Enforce our Terms of Service and Acceptable Use Policy when violations are reported or reasonably apparent.</li>
        </ul>
        <p>Plaintext Content is <strong>never sold</strong> to third parties and is <strong>never used</strong> for advertising or targeted content delivery (we do not serve external third-party advertisements, and have no intention of doing so).</p>

        <h4>Automatically Collected Information</h4>
        <p>We use automatically collected information to:</p>
        <ul>
          <li>Operate, maintain, and secure our Services;</li>
          <li>Determine your jurisdiction for legal compliance;</li>
          <li>Detect and respond to security threats (brute-force attacks, suspicious login patterns, bot detection);</li>
          <li>Diagnose and fix bugs and performance issues;</li>
          <li>Understand aggregate usage patterns to improve the platform (without linking this data to your Alias activity or content).</li>
        </ul>

        <h4>What We Never Do With Your Information</h4>
        <ul>
          <li>We never sell your personal information or content to anyone;</li>
          <li>We never serve third-party advertisements or use your data for ad targeting;</li>
          <li>We never use AI or automated decision-making to profile you, serve content recommendations, or make decisions that produce legal or significant effects concerning you;</li>
          <li>We never attempt to link your Account to your Aliases outside of the authenticated session you initiate;</li>
          <li>We never use your E2EE Content for any purpose other than encrypted storage, transmission, and limited CSAM hash-matching (when content moderation is enabled).</li>
        </ul>
        <blockquote>
          <p>We use your data to run the platform and keep it safe. We don't sell it, we don't advertise with it, and we don't feed it to algorithms. Everything costs something: because you pay with a subscription, you don't have to pay with surveillance.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'data-sharing',
    title: 'Data Sharing and Disclosure',
    content: (
      <>
        <p>We share your information only in the following limited circumstances:</p>

        <h4>Service Providers</h4>
        <p>We use a limited number of third-party providers to operate our Services. These providers process data on our behalf under contractual obligations that prohibit them from using your data for their own purposes:</p>
        <ul>
          <li><strong>Stripe</strong> (payment processing). Receives billing and payment method information necessary to process transactions;</li>
          <li><strong>VerifyMy</strong> (age verification). You submit information directly to them; we selected this provider specifically because they return only a pass/fail result and jurisdiction to us. Nothing else about you, not even your age;</li>
          <li><strong>Infrastructure providers (AWS)</strong> (hosting, bandwidth, and storage). These providers process encrypted data in transit and at rest but do not have access to decryption keys for E2EE Content;</li>
          <li><strong>GIF/Sticker providers</strong> (content delivery for media you request). Your device connects to their servers when you search for GIFs or Stickers, and they receive search terms you input so that they can serve results; we do not share your Account or Alias information with them.</li>
        </ul>

        <h4>Legal Requirements</h4>
        <p>We may disclose information when we believe in good faith that disclosure is necessary to:</p>
        <ul>
          <li>Comply with applicable law, regulation, legal process, or enforceable governmental request;</li>
          <li>Enforce our Terms of Service, including investigation of potential violations;</li>
          <li>Detect, prevent, or address fraud, security, or technical issues;</li>
          <li>Protect against harm to the rights, property, or safety of Adieuu, our Users, or the public as required or permitted by law.</li>
        </ul>
        <p>When we receive legal requests for user data, we will:</p>
        <ul>
          <li>Scrutinize the request for legal validity and scope;</li>
          <li>Narrow our response to only the data specifically required;</li>
          <li>Notify the affected user unless prohibited by law or court order (or unless doing so would endanger someone's safety);</li>
          <li>Be transparent: we cannot produce what we don't have. E2EE Content is not available to us in readable form, and the Account/Alias linkage is not derivable from our systems.</li>
        </ul>
        <blockquote>
          <p>We comply with all applicable laws to the best of our ability. However, if law enforcement asks for the content of your encrypted messages, our honest answer is "we can't read them either." If they ask which Account owns an Alias, the answer is "we aren't able to determine that."</p>
        </blockquote>

        <h4>Mandatory Reporting</h4>
        <p>We are legally required to report detected child sexual abuse material (CSAM) to the National Center for Missing & Exploited Children (NCMEC) and relevant law enforcement. This is the sole circumstance in which content is proactively disclosed to a third party, and it is limited to content flagged by hash-matching technology (not AI) against known databases of illegal material.</p>

        <h4>Business Transfers</h4>
        <p>If Adieuu is involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will attempt to provide advance notice via our Services and/or the contact information associated with your Account, and any successor entity will be bound by the terms of this Privacy Policy with respect to data collected prior to the transfer.</p>

        <h4>With Your Consent</h4>
        <p>We may share information with third parties when you explicitly direct us to do so (for example, by connecting a third-party integration to a Space you administer).</p>

        <h4>What We Never Share</h4>
        <ul>
          <li>We never share data with data brokers or advertising networks;</li>
          <li>We never share Account-to-Alias linkage information with anyone (because we cannot derive it);</li>
          <li>We never share the readable content of E2EE messages (because we don't have it);</li>
          <li>We never share your data for commercial profiling by third parties.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'data-retention',
    title: 'Data Retention',
    content: (
      <>
        <p>We retain different categories of information for different periods, guided by the principle that we keep data only as long as necessary for its stated purpose.</p>

        <h4>Account Data</h4>
        <ul>
          <li><strong>Active accounts:</strong> Retained for as long as your Account is active;</li>
          <li><strong>Deleted accounts:</strong> Upon Account deletion, we remove your Account data within thirty (30) days, except where retention is required by law (e.g., billing records for tax compliance, which are retained for the minimum period required by applicable law);</li>
          <li><strong>Security logs:</strong> Login history and security events are retained for up to twelve (12) months, then deleted.</li>
        </ul>

        <h4>Alias Data</h4>
        <ul>
          <li><strong>Active Aliases:</strong> Alias profile information and Plaintext Content are retained for as long as the Alias exists;</li>
          <li><strong>Deleted Aliases:</strong> Upon Alias deletion, we remove associated Plaintext Content and profile data within thirty (30) days;</li>
          <li><strong>Terminated Aliases:</strong> When an Alias is terminated for a policy violation, we may retain limited metadata (username, termination reason, and relevant content excerpts) for a reasonable period to support appeals, prevent ban evasion, and maintain enforcement records. If your Alias has been Terminated in relation to a report to law enforcement, some or all of your Alias data may be preserved as required by law to aid in the investigation. In such cases, data is preserved only so long as applicable law requires.</li>
        </ul>

        <h4>E2EE Content</h4>
        <ul>
          <li>E2EE Content ciphertext is retained until you or a Recipient deletes it, or until the Conversation or Space is removed;</li>
          <li>Moderation Copies (temporary plaintext copies of attachments submitted for CSAM scanning) are deleted immediately after processing and are not retained, except in cases where CSAM is detecting through hash-matching. In such cases where CSAM is detected, pursuant to <a href="https://www.law.cornell.edu/uscode/text/18/2258A" target="_blank" rel="noopener noreferrer">18 U.S. Code § 2258A</a>, we file a report via the CyberTipeline to NCMEC and are then required to securely preserve a copy of the content, associated metadata, and other relevant information and commingled content for 1 year after the submission of the report to NCMEC.</li>
        </ul>

        <h4>Automatically Collected Data</h4>
        <ul>
          <li>IP addresses and connection metadata are retained for no longer than ninety (90) days for security and abuse-prevention purposes, unless a specific security event requires longer retention;</li>
          <li>Aggregated, anonymized usage analytics (which cannot identify any individual; for example, "200% more people clicked button A than button B") may be retained indefinitely.</li>
        </ul>

        <h4>Legal Holds</h4>
        <p>We may retain data beyond our standard retention periods when required by law, legal proceedings, or governmental investigation. When a legal hold is lifted, data subject to the hold will be deleted in accordance with our standard retention schedule.</p>
        <blockquote>
          <p>We don't hoard data. Active stuff stays; deleted stuff goes within 30 days. Security logs last 12 months. IP data lasts 90 days. Temporary moderation copies are deleted immediately after scanning. If the law requires us to keep something longer, we do, but only as long as the law requires.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your Rights and Choices',
    content: (
      <>
        <p>Regardless of where you live, we provide all users with the following rights and controls:</p>

        <h4>Universal Rights</h4>
        <ul>
          <li><strong>Access:</strong> You can access your Account information through your Account settings at any time;</li>
          <li><strong>Export:</strong> You can export your Account data and your Alias's Plaintext Content through the export functionality in the app (see Data Portability in our Terms of Service);</li>
          <li><strong>Correction:</strong> You can update your Account information (email, phone, payment method) and Alias information (display name, username, profile) at any time;</li>
          <li><strong>Deletion:</strong> You can delete your Account through your Account settings or by contacting us. You can delete individual Aliases and their associated content;</li>
          <li><strong>Communication preferences:</strong> You can manage notification preferences in your Account settings. Certain communications (security alerts, legal notices) cannot be opted out of while you maintain an active Account.</li>
        </ul>

        <h4>Additional Rights by Jurisdiction</h4>
        <h5>European Economic Area, United Kingdom, and Switzerland (GDPR)</h5>
        <p>If you are located in the EEA, UK, or Switzerland, you have additional rights under the General Data Protection Regulation (or UK GDPR):</p>
        <ul>
          <li><strong>Legal basis:</strong> We process your data based on: (a) contract performance (providing the Services you've subscribed to), (b) legitimate interests (security, fraud prevention, service improvement, balanced against your rights), and (c) legal obligations (tax records, mandatory reporting);</li>
          <li><strong>Right to restriction:</strong> You may request that we restrict processing of your data in certain circumstances;</li>
          <li><strong>Right to object:</strong> You may object to processing based on legitimate interests;</li>
          <li><strong>Right to portability:</strong> You may request your data in a structured, machine-readable format (available through our export feature);</li>
          <li><strong>Right to lodge a complaint:</strong> You may file a complaint with your local data protection authority;</li>
          <li><strong>Data transfers:</strong> As Adieuu is based in the United States, your data is transferred to and processed in the US. We rely on Standard Contractual Clauses and our platform's technical safeguards (including E2EE) to protect data transferred internationally.</li>
        </ul>

        <h5>California (CCPA/CPRA)</h5>
        <p>If you are a California resident, you have rights under the California Consumer Privacy Act (as amended by the CPRA):</p>
        <ul>
          <li><strong>Right to know:</strong> You may request disclosure of the categories and specific pieces of personal information we have collected about you;</li>
          <li><strong>Right to delete:</strong> You may request deletion of your personal information, subject to certain legal exceptions;</li>
          <li><strong>Right to correct:</strong> You may request correction of inaccurate personal information;</li>
          <li><strong>No sale or sharing:</strong> We do not sell your personal information and do not share it for cross-context behavioral advertising. We have never done so;</li>
          <li><strong>No discrimination:</strong> We will not discriminate against you for exercising your privacy rights.</li>
        </ul>

        <h5>Other Jurisdictions</h5>
        <p>If you are located in a jurisdiction with privacy legislation that provides rights beyond those listed above (such as Brazil's LGPD, Canada's PIPEDA, or Australia's Privacy Act), we will honor those rights to the extent applicable. Contact us at <a href="mailto:privacy@adieuu.com" target="_blank" rel="noopener noreferrer">privacy@adieuu.com</a> to exercise any jurisdiction-specific rights.</p>

        <h4>Exercising Your Rights</h4>
        <p>Most rights can be exercised directly through your Account and Alias settings without needing to contact us. For requests that require our assistance, email <a href="mailto:privacy@adieuu.com" target="_blank" rel="noopener noreferrer">privacy@adieuu.com</a>. We will respond within thirty (30) days (or sooner where required by law). We may need to verify your identity before processing certain requests.</p>

        <h4>Limitations</h4>
        <p>Some requests are subject to limitations inherent to our architecture:</p>
        <ul>
          <li>We cannot provide you with data we don't have (e.g., E2EE message plaintext, Account-to-Alias linkage);</li>
          <li>We cannot export E2EE Content on your behalf because we cannot decrypt it;</li>
          <li>If you lose your Alias password, we cannot recover the Alias or its data. This is a consequence of the privacy-preserving design you benefit from.</li>
        </ul>
        <blockquote>
          <p>You can access, export, correct, and delete your data, mostly without even contacting us. The only limits are architectural: we can't give you what we can't read, and we can't undo cryptography.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    content: (
      <>
        <p>No system is immune to breach. Every platform will eventually face one. Our security philosophy starts from that assumption: we invest heavily in preventing breaches, but we have also architected our systems so that when (not if) one occurs, the damage is contained and compartmentalized.</p>
        <p>This is where our Account/Alias separation and E2EE architecture become security features, not just privacy features. A breach of one data layer does not cascade into exposure of another. Your identity, your activity, and your encrypted content are isolated from each other by design.</p>

        <h4>Technical Safeguards</h4>
        <ul>
          <li><strong>End-to-end encryption:</strong> Conversations use a hybrid key exchange combining X25519 (classical) and ML-KEM-768/1024 (post-quantum), so that message confidentiality holds even if either algorithm is broken in the future. Session keys are derived via HKDF-SHA3-256 and messages are encrypted with ChaCha20-Poly1305. Messages are signed with Ed25519. We store only ciphertext that we cannot decrypt, meaning a server-side breach does not expose message content;</li>
          <li><strong>Encryption at rest:</strong> All data stored on our servers is encrypted at rest using AES-256-GCM, including Plaintext Content and Account data;</li>
          <li><strong>Encryption in transit:</strong> All communications between your device and our servers use TLS;</li>
          <li><strong>Cryptographic Account/Alias separation:</strong> The one-way derivation uses Argon2id (memory-hard) with a SHA3-256 outer hash. A breach of Account data does not reveal Alias activity, and a breach of Alias data does not reveal Account identity;</li>
          <li><strong>Password hashing:</strong> All passwords are stored using Argon2id with high memory and time cost parameters, making brute-force attacks computationally prohibitive;</li>
          <li><strong>Multi-factor authentication:</strong> We support TOTP authenticator apps, hardware security keys (FIDO2/WebAuthn), and other MFA methods;</li>
          <li><strong>Rate limiting and abuse detection:</strong> Automated systems detect and mitigate brute-force attacks, credential stuffing, and other automated threats;</li>
          <li><strong>Open source:</strong> Our entire codebase is publicly available for independent audit and verification. You do not need to take our word for any claim in this policy; you can read the code yourself;</li>
          <li><strong>Build attestations:</strong> We generate cryptographic build attestations via our GitHub Actions pipelines, allowing you to verify that the deployed artifacts correspond to the public source code;</li>
          <li><strong>Software Bill of Materials (SBOM):</strong> We generate and publish SBOMs for our application layers with each release, providing full transparency into our dependency chain. All SBOMs are uploaded to Manifest Cyber for continuous vulnerability and license scanning;</li>
          <li><strong>Red teaming and penetration testing:</strong> We conduct both internal and external red team exercises and penetration tests at least twice per year to proactively identify and remediate vulnerabilities before they can be exploited;</li>
          <li><strong>Disaster recovery and incident response:</strong> We maintain and test disaster recovery, incident response, and contingency plans annually to ensure we can respond effectively to security events and restore services with minimal disruption.</li>
        </ul>

        <h4>Organizational Safeguards</h4>
        <ul>
          <li>Access to user data is restricted to personnel who require it for their job function;</li>
          <li>Access is logged and auditable;</li>
          <li>Staff cannot access E2EE Content regardless of their role (the keys don't exist on our servers);</li>
          <li>Staff cannot derive Account-to-Alias linkage regardless of their role (the derivation is one-way and requires information only the user possesses and/or explicit code changes that require new deployments and would be visible in our public source code repositories);</li>
          <li>Pull request approval and merging into production branches on GitHub is tightly controlled and heavily monitored;</li>
          <li>Access to deployment pipelines and infrastructure environments follows the principle of least privilege, with access grants scoped to specific roles and reviewed regularly.</li>
        </ul>

        <h4>Your Role in Security</h4>
        <p>Security is a shared responsibility. Our architecture protects you at the platform level, but your own practices matter:</p>
        <ul>
          <li>Use strong, unique passwords for both your Account and each Alias;</li>
          <li>Enable multi-factor authentication (hardware keys provide the strongest protection);</li>
          <li>Keep your devices and software up to date;</li>
          <li>Do not share your credentials with anyone;</li>
          <li>Report suspected compromises immediately via <a href="mailto:say@adieuu.com" target="_blank" rel="noopener noreferrer">say@adieuu.com</a>.</li>
        </ul>

        <h4>Breach Notification</h4>
        <p>In the event of a data breach that affects your personal information, we will notify affected users and relevant authorities in accordance with applicable law. Because of our compartmentalized architecture, we expect most breach scenarios to have limited blast radius: a compromise of Alias data would not expose Account identities, and a compromise of message storage would yield only unreadable ciphertext.</p>

        <h4>Security Disclosures</h4>
        <p>If you discover a security vulnerability in our Services, please report it responsibly to <a href="mailto:security@adieuu.com" target="_blank" rel="noopener noreferrer">security@adieuu.com</a>. We take security reports seriously and will respond promptly.</p>
        <blockquote>
          <p>We do our best to prevent breaches, but we've built our systems expecting one. That's why your identity, your activity, and your messages are isolated from each other: so that a compromise of one doesn't cascade into exposure of the others. Security is also a shared responsibility on your end. Enable MFA, use strong passwords, and keep your devices secure.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'cookies-and-tracking',
    title: 'Cookies and Similar Technologies',
    content: (
      <>
        <p>We use a minimal set of cookies and similar technologies, limited to what is necessary to operate our Services:</p>

        <h4>Cookies We Use</h4>
        <ul>
          <li><strong>Session cookies:</strong> Essential for authentication and maintaining your signed-in state. These expire when you sign out or after a period of inactivity;</li>
          <li><strong>Security cookies:</strong> Used to detect and prevent unauthorized access, CSRF attacks, and session hijacking;</li>
          <li><strong>Preference cookies:</strong> Store your settings (such as theme, language, or high-contrast mode) to provide a consistent experience.</li>
        </ul>

        <h4>What We Do Not Use</h4>
        <ul>
          <li>No third-party advertising cookies or tracking pixels;</li>
          <li>No cross-site tracking technologies;</li>
          <li>No fingerprinting for advertising or profiling purposes;</li>
          <li>No social media tracking widgets.</li>
        </ul>

        <p>Because we do not use analytics or advertising cookies, and our cookies are strictly necessary for the operation of the service or reflect your explicit preferences, most cookie consent frameworks do not require a banner for our use case. If applicable law in your jurisdiction requires explicit consent even for essential cookies, we will provide the appropriate mechanism.</p>
        <blockquote>
          <p>We don't track you across the web. Our cookies do one thing: keep you signed in and your settings saved. That's it.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children\'s Privacy',
    content: (
      <>
        <p>Adieuu is not designed for, directed toward, or intended for use by anyone under the age of 18 (or the age of majority in their jurisdiction, whichever is greater). We do not knowingly collect personal information from children.</p>
        <p>If we become aware that we have collected personal information from someone under the minimum age requirement, we will take steps to delete that information promptly and terminate the associated Account.</p>
        <p>If you believe a child has provided us with personal information, please contact us at <a href="mailto:privacy@adieuu.com" target="_blank" rel="noopener noreferrer">privacy@adieuu.com</a>.</p>
      </>
    ),
  },
  {
    id: 'international-transfers',
    title: 'International Data Transfers',
    content: (
      <>
        <p>Adieuu, LLC is located in the United States. When you use our Services, your data is transferred to and processed in the United States, regardless of where you are located.</p>
        <p>For users in the EEA, UK, and other jurisdictions that restrict international data transfers, we rely on:</p>
        <ul>
          <li>Standard Contractual Clauses (SCCs) approved by the European Commission;</li>
          <li>The UK International Data Transfer Agreement/Addendum where applicable;</li>
          <li>Technical safeguards inherent to our architecture: E2EE Content is encrypted before it leaves your device, meaning the data that crosses borders is ciphertext that cannot be read without the decryption keys held only on participant devices.</li>
        </ul>
        <p>Our privacy-preserving architecture provides a supplementary measure beyond legal frameworks: for E2EE Content, the transferred data is unintelligible without keys we do not possess, providing strong protection regardless of the legal environment in the destination country.</p>
      </>
    ),
  },
  {
    id: 'do-not-track',
    title: 'Do Not Track and Global Privacy Controls',
    content: (
      <p>We do not track users across third-party websites or services, so Do Not Track (DNT) browser signals and Global Privacy Control (GPC) signals do not change our behavior because we already don't engage in the tracking those signals are designed to prevent. We do not sell or share personal information for cross-context behavioral advertising under any circumstances.</p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to This Policy',
    content: (
      <>
        <p>We may update this Privacy Policy from time to time to reflect changes in our practices, legal requirements, or platform capabilities. When we make material changes:</p>
        <ul>
          <li>We will provide reasonable advance notice via our Services, email, or other appropriate means;</li>
          <li>The "Last Updated" date at the top of this policy will be revised;</li>
          <li>For changes that materially reduce your privacy protections, we will provide at least thirty (30) days' notice before the changes take effect.</li>
        </ul>
        <p>Your continued use of our Services after the effective date of a revised policy constitutes acceptance of the changes. If you disagree with a change, you may delete your Account and discontinue use of our Services.</p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Contact Us',
    content: (
      <>
        <p>If you have questions about this Privacy Policy, want to exercise your privacy rights, or have concerns about our data practices:</p>
        <ul>
          <li><strong>General privacy inquiries:</strong> <a href="mailto:privacy@adieuu.com" target="_blank" rel="noopener noreferrer">privacy@adieuu.com</a></li>
          <li><strong>Data subject requests:</strong> <a href="mailto:privacy@adieuu.com" target="_blank" rel="noopener noreferrer">privacy@adieuu.com</a></li>
          <li><strong>Security concerns:</strong> <a href="mailto:security@adieuu.com" target="_blank" rel="noopener noreferrer">security@adieuu.com</a></li>
          <li><strong>General questions:</strong> <a href="mailto:say@adieuu.com" target="_blank" rel="noopener noreferrer">say@adieuu.com</a></li>
        </ul>
        <p>
          <strong>Adieuu, LLC</strong><br />
          1617 Park Place Ave Suite 110-AD<br />
          Fort Worth, TX 76110, USA
        </p>
        <p>We will respond to privacy-related inquiries within thirty (30) days, or sooner where required by applicable law.</p>
      </>
    ),
  },
];

interface ContentProps {
  highContrast?: boolean;
  onToggleHighContrast?: () => void;
}

export function PrivacyPolicyContent({ highContrast, onToggleHighContrast }: ContentProps) {
  return (
    <LegalPolicyDocument
      sections={PRIVACY_POLICY_SECTIONS}
      highContrast={highContrast}
      onToggleHighContrast={onToggleHighContrast}
    />
  );
}

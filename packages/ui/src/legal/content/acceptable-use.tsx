import type { LegalPolicySection } from '../LegalPolicyDocument';
import { LegalPolicyDocument } from '../LegalPolicyDocument';

const ACCEPTABLE_USE_SECTIONS: LegalPolicySection[] = [
  {
    id: 'overview',
    title: 'Overview',
    content: (
      <>
        <p>
          <strong>Effective:</strong> 23 June 2026<br />
          <strong>Last Updated:</strong> 23 June 2026
        </p>
        <p>
          This Acceptable Use Policy ("AUP") describes conduct and content that is prohibited on Adieuu. It is incorporated into and forms part of our{' '}
          <a href="/legal-policies/tos" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>
          . By using our Services, you agree to comply with this policy.
        </p>
        <p>
          Adieuu exists to make online conversation more human. We built a platform with structural barriers against bots, throwaways, and bad-faith actors: you pay for your Account, and you have a finite number of Aliases — dodging blocks or enforcement actions becomes expensive. This restores the kind of natural accountability that free, anonymous platforms typically lack. At the same time, the cryptographic separation between your Account (your private identity) and your Aliases (how you speak and act on the platform) means you can engage honestly without the social, professional, or political pressures that come with having your name attached to every word. Our architecture provides both accountability and free speech — not one at the expense of the other.
        </p>
        <p>
          We designed this policy to protect our users, our platform, and the broader community while respecting individual expression and privacy. We recognize the importance of free speech and the diversity of viewpoints our users may hold. We intervene only where conduct or content poses genuine risk of harm — not because we disagree with it.
        </p>
        <blockquote>
          <p>Our goal is a platform where real people can communicate freely without fear of harassment, exploitation, or harm, and with a reasonable expectation they're conversing with other humans. We don't police opinions, but we do enforce against behavior that harms others or undermines the human character of this platform.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'guiding-principles',
    title: 'Guiding Principles',
    content: (
      <>
        <p>Our enforcement of this policy is guided by the following principles:</p>
        <ul>
          <li><strong>Harm over offense:</strong> We act on conduct that causes or threatens tangible harm, not on content that is merely disagreeable, controversial, or unpopular.</li>
          <li><strong>Context matters:</strong> We consider the context in which content is shared, including the intent of the speaker, the audience, and the medium (e.g., a private Conversation vs. a Public Space).</li>
          <li><strong>Privacy by default:</strong> We do not proactively surveil private communications. Enforcement in private Conversations and E2EE spaces is generally limited to reports, legal requirements, and CSAM hash-matching as described in our Terms of Service.</li>
          <li><strong>Proportional response:</strong> We use the least restrictive enforcement action appropriate to the violation. A first-time, minor violation is treated differently than a repeated or severe one.</li>
          <li><strong>Transparency:</strong> When we take enforcement action, we provide as much explanation as we can (subject to legal constraints and safety considerations).</li>
          <li><strong>Accountability is structural:</strong> Our platform architecture — paid Accounts, finite Aliases, and permanent consequences for terminated Aliases — creates inherent accountability. We rely on this structure as a first line of defense rather than invasive surveillance or preemptive content filtering.</li>
          <li><strong>Humans moderate humans:</strong> Content moderation decisions on Adieuu are made by human reviewers, not automated systems or AI. We believe that the nuance required to fairly enforce policy in context demands human judgment.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'prohibited-content',
    title: 'Prohibited Content',
    content: (
      <>
        <p>You may not use Adieuu to create, upload, share, or distribute the following types of content:</p>
        <h4>Illegal Content</h4>
        <p>Content that violates applicable law in the jurisdiction from which it is posted or in the United States, including but not limited to:</p>
        <ul>
          <li>Child sexual abuse material ("CSAM") or any sexual content involving minors;</li>
          <li>Non-consensual intimate imagery ("NCII"), including AI-generated, deepfake, or otherwise synthetically created sexual or intimate imagery of real individuals produced without their consent;</li>
          <li>Content that facilitates human trafficking or exploitation;</li>
          <li>Content that constitutes or facilitates fraud, identity theft, or financial crimes;</li>
          <li>Content that facilitates the sale, purchase, or exchange of illegal drugs, controlled substances, stolen goods, or other contraband;</li>
          <li>Content that facilitates the unlawful sale or transfer of firearms, explosives, or other regulated weapons in violation of applicable law;</li>
          <li>Content subject to court orders, injunctions, or legal prohibitions.</li>
        </ul>
        <blockquote>
          <p>CSAM is always reported to NCMEC and relevant law enforcement. There is no appeal for CSAM-related enforcement and no exception to this rule.</p>
        </blockquote>

        <h4>Violent and Dangerous Content</h4>
        <ul>
          <li>Credible threats of physical violence against specific individuals or groups;</li>
          <li>Content that incites or glorifies imminent acts of violence;</li>
          <li>Instructions or materials for manufacturing weapons of mass destruction, explosives (outside of lawful educational contexts), or chemical/biological agents intended to harm;</li>
          <li>Content that recruits for, coordinates, or glorifies terrorist activity or violent extremist ideologies;</li>
          <li>Gratuitously graphic depictions of real-world violence, gore, or mutilation shared for shock value or to glorify harm (journalistic, documentary, educational, and historical contexts are generally permitted with appropriate context).</li>
        </ul>
        <blockquote>
          <p>Discussing violence in historical, journalistic, educational, or fictional contexts is generally permitted. We distinguish between discussion and incitement, and between documentation and glorification.</p>
        </blockquote>

        <h4>Exploitation and Abuse</h4>
        <ul>
          <li>Content designed to harass, stalk, intimidate, or threaten a specific individual in a sustained or targeted manner;</li>
          <li>Coordinating, organizing, or participating in targeted harassment campaigns against individuals or groups (brigading), including mass-reporting, dogpiling, or directing others to harass a target;</li>
          <li>Sextortion: threatening to share, publish, or distribute intimate or sexual content of another person in order to coerce, extort, or manipulate them;</li>
          <li>Doxxing: sharing private personal information (home address, phone number, workplace, etc.) of anyone else, without their permission. Even if you have no intent to harass or endanger, sharing others' private information may enable someone else to harass or endanger the user;</li>
          <li>Content that promotes, instructs, or glorifies self-harm or suicide, or that targets individuals in crisis with such material (educational, harm-reduction, and support-oriented discussions are permitted);</li>
          <li>Sharing graphic imagery of self-harm with the intent to encourage, normalize, or spread such behavior;</li>
          <li>Content that depicts, promotes, or glorifies animal cruelty or torture.</li>
        </ul>

        <h4>Hateful Content</h4>
        <p>Content that dehumanizes, calls for violence against, or promotes hatred toward individuals or groups based on protected characteristics, including but not limited to race, ethnicity, national origin, religion, sex, gender identity, sexual orientation, disability, or serious medical condition.</p>
        <blockquote>
          <p>This provision targets dehumanization and incitement — not disagreement, not offense, and not criticism of ideas. You can criticize any religion, ideology, political movement, or institution. You can hold and express views that others find abhorrent. The line is drawn at content whose clear purpose is to strip people of their humanity or call for harm based on who they are. Context matters: academic discussion, quotation, counter-speech, and satire are evaluated in context and are not presumptively violations.</p>
        </blockquote>

        <h4>Deceptive and Manipulative Content</h4>
        <ul>
          <li>Impersonation of another person, entity, or Adieuu staff with intent to deceive;</li>
          <li>Scams and social engineering, including but not limited to romance scams, investment/cryptocurrency fraud, phishing, and impersonating Adieuu staff or support in order to obtain credentials, payments, or personal information from other users;</li>
          <li>Coordinated inauthentic behavior, including operating networks of Aliases to artificially amplify content, manipulate discussions, or mislead other users about the origin or popularity of content;</li>
          <li>Deliberately misleading content that poses an imminent risk of physical harm (e.g., false emergency alerts, dangerous medical instructions presented as fact);</li>
          <li>Using AI, bots, or automated systems to generate content or interactions that masquerade as human conversation without disclosure.</li>
        </ul>
        <blockquote>
          <p>Satire, parody, and fan accounts are permitted so long as they do not impersonate with intent to deceive. Pseudonymous use (which is how Aliases work) is encouraged — the line is drawn at deceptive impersonation of a specific real person or entity. Adieuu is a platform for human conversation; undisclosed automated participants undermine that purpose.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'prohibited-conduct',
    title: 'Prohibited Conduct',
    content: (
      <>
        <p>You may not engage in the following conduct on or through Adieuu:</p>
        <h4>Platform Integrity</h4>
        <ul>
          <li>Attempting to gain unauthorized access to other users' Accounts, Aliases, or Content;</li>
          <li>Reverse engineering, decompiling, or attempting to extract the source code of our proprietary software (except as permitted in our Terms of Service);</li>
          <li>Distributing malware, viruses, or other harmful code through our Services;</li>
          <li>Automated access, scraping, or data collection from our Services without prior written consent (including bots, crawlers, or scripts that access our Services in a non-human manner);</li>
          <li>Interfering with or disrupting the operation of our Services, including denial-of-service attacks, packet flooding, or deliberate overloading;</li>
          <li>Circumventing or attempting to circumvent any access restrictions, rate limits, security mechanisms, content moderation systems, or sanctions controls in our Services.</li>
        </ul>

        <h4>Account Abuse</h4>
        <ul>
          <li>Creating Accounts or Aliases for the purpose of evading prior enforcement actions (ban evasion);</li>
          <li>Selling, purchasing, or trading Accounts or Aliases;</li>
          <li>Using our Services if you are under the minimum age requirement;</li>
          <li>Creating Accounts using information that does not belong to you or that you are not authorized to use;</li>
          <li>Using stolen, fraudulent, or unauthorized payment methods to create or maintain an Account.</li>
        </ul>
        <blockquote>
          <p>Your Account represents a real commitment — a real payment method, a real person, and a finite number of Aliases. Attempts to circumvent this structure (through fraud, evasion, or trading) undermine the accountability that makes Adieuu work for everyone.</p>
        </blockquote>

        <h4>Spam and Commercial Abuse</h4>
        <ul>
          <li>Sending unsolicited bulk messages, advertisements, or promotional content;</li>
          <li>Using our Services primarily to drive traffic to external services or to generate revenue through deceptive means;</li>
          <li>Artificially inflating engagement metrics or manipulating ranking systems;</li>
          <li>Operating automated or semi-automated Aliases (bots) without prior written authorization from Adieuu.</li>
        </ul>
        <blockquote>
          <p>Sharing a link to your own work or project in relevant Spaces is fine. The line is crossed when messaging becomes unsolicited, bulk, repetitive, or deceptive. Every Alias on Adieuu should represent a human being participating in good faith.</p>
        </blockquote>

        <h4>Violations of Others' Rights</h4>
        <ul>
          <li>Infringing on the intellectual property rights of others (see our <a href="/legal-policies/tos#dmca-counter-notification" target="_blank" rel="noopener noreferrer">DMCA Policy</a> for the formal process);</li>
          <li>Violating the privacy of others by sharing their personal information without consent, beyond what is described under "Doxxing" above;</li>
          <li>Recording or distributing conversations or content from private or E2EE Spaces without the consent of all participants.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'content-labeling',
    title: 'Content Labeling and Age-Restricted Material',
    content: (
      <>
        <p>Adieuu is an adults-only platform (18+), but not all content is appropriate for all contexts. Users and Space administrators share responsibility for appropriate content labeling:</p>
        <ul>
          <li>Spaces that regularly host sexually explicit content, graphic violence (in permitted contexts such as journalism or documentary), or other content widely considered Not Safe For Work ("NSFW") may not be fully public and must be configured with the appropriate content labels and restrictions provided in our Services;</li>
          <li>Fully public Spaces (those with content publicly accessible without a verified account) may not allow sharing of NSFW content (due to jurisdictional requirements for many users requiring age verification prior to accessing adult content); </li>
          <li>Users who share NSFW content in Spaces that are not appropriately labeled may have that content removed and may face enforcement action for repeated violations (especially in public spaces);</li>
          <li>Space administrators are responsible for ensuring their Space's content labels accurately reflect the content permitted and shared within.</li>
        </ul>
        <blockquote>
          <p>We're all adults here, but consent and context still matter. Content labeling ensures people opt into what they see. Space admins: label your Spaces honestly.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'space-administrator-responsibilities',
    title: 'Space Administrator Responsibilities',
    content: (
      <>
        <p>If you create or administer a Space, you take on additional responsibility for the environment within it:</p>
        <ul>
          <li>You must make reasonable efforts to address violations of this AUP that occur within your Space when they are reported to you or are reasonably apparent;</li>
          <li>You must configure content labels and Space settings accurately and keep them current;</li>
          <li>You may not configure or operate a Space whose primary purpose is to facilitate violations of this AUP (e.g., a Space dedicated to harassment campaigns, distribution of illegal content, or coordination of abuse);</li>
          <li>You are expected to use the moderation tools provided by our Services in good faith.</li>
        </ul>
        <p>We do not require Space administrators to actively police all content at all times — that would be unreasonable and inconsistent with our privacy principles. However, willful neglect of a Space that has become a persistent source of AUP violations may result in enforcement action against the Space itself (restriction or removal) and, in serious cases, against the administrating Alias.</p>
        <blockquote>
          <p>Running a Space is a privilege, not just a feature. You don't need to read every message, but you must avoid looking the other way when your Space is being used to harm people.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'what-is-not-prohibited',
    title: 'What Is Not Prohibited',
    content: (
      <>
        <p>For clarity, the following are <strong>not</strong> violations of this policy:</p>
        <ul>
          <li>Expressing unpopular, controversial, or minority opinions;</li>
          <li>Criticizing public figures, institutions, companies, religions, ideologies, or ideas — including harsh, pointed, or unflattering criticism;</li>
          <li>Sharing lawful adult content in appropriately labeled Spaces (where permitted by the Space's settings and applicable law);</li>
          <li>Using strong language, profanity, or vulgarity (outside of targeted harassment);</li>
          <li>Discussing sensitive topics (war, politics, religion, drugs, sexuality, etc.) in good faith;</li>
          <li>Reporting on or discussing events that involve violence, provided it is not glorifying or inciting;</li>
          <li>Disagreeing with or blocking other users;</li>
          <li>Expressing views that others find morally objectionable, provided those views do not cross into dehumanization or calls for violence against protected groups;</li>
          <li>Dark humor, edgy jokes, or provocative speech that does not constitute targeted harassment or dehumanization.</li>
        </ul>
        <blockquote>
          <p>We are not in the business of policing thought, tone, or opinion. You will encounter perspectives you disagree with — that's by design. The remedy for speech you dislike is more speech, or the block button. Disagreement alone is never grounds for enforcement, and neither is being offended.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'enforcement',
    title: 'Enforcement',
    content: (
      <>
        <p>When we determine that a violation of this policy has occurred, we may take one or more of the following actions, depending on the severity and context of the violation:</p>
        <h4>Enforcement Actions (Escalating)</h4>
        <ul>
          <li><strong>Warning:</strong> A notice to the Alias that the content or behavior violates our policies, with a request to remove or cease;</li>
          <li><strong>Content removal:</strong> Removal or restriction of specific content that violates this policy;</li>
          <li><strong>Feature restriction:</strong> Temporary or permanent restriction of specific features (e.g., ability to post in Public Spaces, send invites, or upload media);</li>
          <li><strong>Space restriction or removal:</strong> Restriction of a Space's visibility, features, or complete removal of a Space that persistently or severely violates this policy;</li>
          <li><strong>Temporary suspension:</strong> Temporary suspension of the Alias for a defined period;</li>
          <li><strong>Permanent termination:</strong> Permanent termination of the Alias.</li>
        </ul>
        <p>Due to the cryptographic separation between Accounts and Aliases, enforcement actions are applied at the Alias level. We are generally unable to trace Aliases back to their associated Accounts. However, because each Account has a finite number of Aliases and Alias termination is permanent and irreversible, enforcement carries real and lasting consequences. A terminated Alias cannot be restored, and the Alias slot it occupied is permanently consumed.</p>

        <h4>Immediate Action</h4>
        <p>In cases involving illegal content (particularly CSAM), credible threats of imminent violence, or active exploitation, we may bypass graduated enforcement and immediately remove content and terminate the Alias without prior warning.</p>

        <h4>Reporting</h4>
        <p>You may report violations of this policy through the reporting function in our Services or by emailing <a href="mailto:abuse@adieuu.com" rel="noopener noreferrer" target="_blank">abuse@adieuu.com</a>. We review all reports but are not obligated to take action on every report. We do not disclose the identity of reporters (unless the reporters themselves are disciplined for false reporting).</p>
        <p>In the interest of transparency, enforcement actions and their surrounding context — including the reviewing staff member, the reasoning behind the decision, and relevant policy citations — may be made visible to affected parties and, where appropriate, to the broader community. We may withhold or redact details where disclosure would compromise the safety of the reporter or Adieuu staff, interfere with an ongoing investigation, or conflict with legal obligations.</p>

        <h4>Appeals</h4>
        <p>If you believe an enforcement action was taken in error, you may appeal by emailing <a href="mailto:iminnocent@adieuu.com" rel="noopener noreferrer" target="_blank">iminnocent@adieuu.com</a>. Appeals will be reviewed by a different reviewer than the one who made the original decision, where possible. Actions related to illegal content (such as CSAM) may not be appealed.</p>
        <blockquote>
          <p>We aim to be fair. If we got it wrong, tell us. Appeals are reviewed by a fresh set of eyes when possible. Given the permanence of Alias termination, we take reports seriously and try to be conservative in our enforcement actions.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'privacy-and-enforcement',
    title: 'Privacy and Enforcement',
    content: (
      <>
        <p>Our commitment to privacy extends to how we enforce this policy:</p>
        <ul>
          <li>We do not (and can't) proactively monitor private Conversations or other E2EE Content (except for automated CSAM hash-matching performed in anonymized content moderation, as described in our Terms of Service);</li>
          <li>Enforcement in private or E2EE contexts is generally triggered by user reports or legal requirements, not by surveillance;</li>
          <li>When we take enforcement action, we attempt to disclose the information necessary to explain the decision;</li>
          <li>We do not share enforcement records with third parties except where required by law (e.g., mandatory reporting of CSAM to NCMEC).</li>
        </ul>
        <blockquote>
          <p>We can't read your encrypted messages and we don't try to. We enforce based on reports, automated (non-AI) reporting on Plaintext Content, and legal obligations, not surveillance.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'changes-to-this-policy',
    title: 'Changes to This Policy',
    content: (
      <>
        <p>We may update this policy from time to time to address new types of harmful conduct, reflect changes in law, or clarify existing provisions. Material changes will be communicated in accordance with the "Modifications" section of our Terms of Service. Your continued use of our Services after changes take effect constitutes acceptance of the updated policy.</p>
        <p>If you have questions about this policy or wish to report a concern, please contact us at <a href="mailto:abuse@adieuu.com" rel="noopener noreferrer" target="_blank">abuse@adieuu.com</a> or <a href="mailto:say@adieuu.com" rel="noopener noreferrer" target="_blank">say@adieuu.com</a>.</p>
      </>
    ),
  },
];

interface ContentProps {
  highContrast?: boolean;
  onToggleHighContrast?: () => void;
}

export function AcceptableUsePolicyContent({ highContrast, onToggleHighContrast }: ContentProps) {
  return (
    <LegalPolicyDocument
      sections={ACCEPTABLE_USE_SECTIONS}
      highContrast={highContrast}
      onToggleHighContrast={onToggleHighContrast}
    />
  );
}

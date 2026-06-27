import type { LegalPolicySection } from '../LegalPolicyDocument';
import { LegalPolicyDocument } from '../LegalPolicyDocument';

const PAID_SERVICES_SECTIONS: LegalPolicySection[] = [
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
          These Paid Services Terms ("PST") govern subscriptions, one-time purchases, sponsorships, promotional codes, and other paid features on Adieuu. They are incorporated into and form part of our{' '}
          <a href="/legal-policies/tos" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>
          . By making a purchase or activating a subscription, you agree to these terms in addition to the Terms of Service.
        </p>
        <p>
          For a detailed comparison of what each subscription tier includes (features, limits, and entitlements), please refer to our{' '}
          <a href="/pricing" target="_blank" rel="noopener noreferrer">
            Pricing
          </a>{' '}
          and{' '}
          <a href="/about/learn#pricing" target="_blank" rel="noopener noreferrer">
            Plan Comparison
          </a>{' '}
          pages. Feature availability, limits, and tier-specific details shown on those pages are subject to change; the most current version at the time of your purchase or renewal governs.
        </p>
        <blockquote>
          <p>We keep pricing details and feature comparisons on dedicated pages so we can update them without revising this legal document every time. What's here covers the rules; what's there covers the specifics.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'subscription-tiers',
    title: 'Subscription Tiers and Purchases',
    content: (
      <>
        <p>Adieuu offers the following categories of paid products:</p>
        <h4>Recurring Subscriptions</h4>
        <ul>
          <li><strong>Access</strong> — An annual subscription providing base-tier access to Adieuu's features and services.</li>
          <li><strong>Insider</strong> — An annual subscription providing elevated access, higher limits, and additional features beyond Access.</li>
        </ul>
        <h4>Lifetime Purchases</h4>
        <ul>
          <li><strong>Vanguard</strong> — A one-time purchase granting permanent Insider-tier access plus the Vanguard entitlement and associated benefits.</li>
          <li><strong>Founder</strong> — A one-time purchase granting permanent Insider-tier access plus the Founder entitlement and associated benefits (including but not limited to product calls, roadmap input sessions, and exclusive community access).</li>
        </ul>
        <p>All recurring subscriptions are billed annually. Lifetime purchases are a single payment with no recurring charges. Both recurring subscriptions and lifetime purchases grant access to Aliases, features, and capabilities as described on our Pricing pages at the time of purchase.</p>
        <h4>Why Annual Billing?</h4>
        <p>We bill annually rather than monthly for a simple reason: our subscription prices are intentionally low, and every transaction carries a fixed processing fee. Monthly billing at our price points would mean a disproportionate share of each payment going to payment processors rather than toward running the platform. Annual billing keeps our costs down, which lets us keep your costs down.</p>
        <blockquote>
          <p>Access and Insider are annual plans. Vanguard and Founder are one-time purchases that last forever — no renewals, no recurring charges.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'payment-and-billing',
    title: 'Payment and Billing',
    content: (
      <>
        <h4>Payment Processing</h4>
        <p>All payments are processed by{' '}
          <a href="https://stripe.com" target="_blank" rel="noopener noreferrer">Stripe</a>
          . By making a purchase, you agree to Stripe's{' '}
          <a href="https://stripe.com/legal" target="_blank" rel="noopener noreferrer">applicable policies</a>
          {' '}as they pertain to you as a buyer. Adieuu does not directly store your full payment card details; this information is handled by Stripe in accordance with PCI-DSS standards.
        </p>
        <h4>Currency</h4>
        <p>Prices are currently displayed and charged in United States Dollars (USD). We may add support for additional currencies in the future; available currencies will be displayed at checkout. Regardless of the currency charged, you are responsible for any currency conversion fees, exchange rate differences, or additional charges imposed by your bank, card issuer, or payment provider.</p>
        <h4>Accepted Payment Methods</h4>
        <p>We currently accept payment methods supported by Stripe, including major credit and debit cards. We may add additional payment methods or processors in the future; available options will be displayed at checkout. You are responsible for ensuring your selected payment method is valid, authorized for use, and has sufficient funds. Adieuu is not responsible for charges, holds, or fees imposed by your payment provider in connection with your use of our Services.</p>
        <h4>Taxes and Fees</h4>
        <p>Prices displayed at checkout may be subject to applicable taxes (such as sales tax or VAT) depending on your jurisdiction. Any applicable taxes will be calculated and displayed before you confirm your purchase. You are responsible for all taxes associated with your purchase except those that Adieuu is legally obligated to collect and remit.</p>
        <h4>Billing Cycle and Renewals</h4>
        <p>Recurring subscriptions (Access and Insider) renew automatically on the anniversary of your initial purchase date unless cancelled before the renewal date. The renewal price will be the then-current price for your plan, subject to the grandfathering provisions described in the "Pricing Changes" section below. You will be charged on the renewal date using the payment method on file.</p>
        <h4>Billing Failures</h4>
        <p>If a renewal payment fails, we will attempt to charge your payment method again according to Stripe's retry schedule. During the period in which payment remains unresolved:</p>
        <ul>
          <li>You may continue to sign into your Account;</li>
          <li>You will be unable to access your Aliases until payment is successfully processed or a valid payment method is provided;</li>
          <li>Your Aliases, their content, and their associated data remain intact — they are not deleted due to billing failures.</li>
        </ul>
        <p>If payment cannot be collected after all retry attempts are exhausted, your subscription will be cancelled. You may resubscribe at any time, at which point Alias access will be restored.</p>
        <blockquote>
          <p>If your payment fails, your Aliases aren't going anywhere — you just can't sign into them until it's sorted out. Your data is safe; we don't delete anything over a billing hiccup.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'pricing-changes',
    title: 'Pricing Changes',
    content: (
      <>
        <p>We may adjust pricing for our subscription plans from time to time. When we do:</p>
        <ul>
          <li>We will provide at least thirty (30) days' advance notice before any price increase takes effect for existing subscribers;</li>
          <li>Existing subscribers who maintain their subscription without interruption are grandfathered at their current price for up to two (2) years following the conclusion of their initial subscription term;</li>
          <li>If your subscription lapses (whether through cancellation, non-payment, or any other interruption) and you later resubscribe, you will be charged the then-current price and the grandfathering period resets;</li>
          <li>Grandfathering applies to the base subscription price only and does not apply to taxes, fees, or any optional add-on services introduced after your original purchase.</li>
        </ul>
        <p>Lifetime purchases (Vanguard and Founder) are not subject to price increases after purchase — the access granted by a lifetime purchase is permanent and is not affected by subsequent pricing changes to recurring plans.</p>
        <blockquote>
          <p>If you stay subscribed, we won't raise your price for at least two years after your initial term ends. If you leave and come back, you pay whatever the current price is. Lifetime purchases are exactly that — lifetime.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'free-trials-and-promotions',
    title: 'Free Trials and Promotional Codes',
    content: (
      <>
        <h4>Free Trials</h4>
        <p>We may offer free trial periods for certain subscription tiers. Unless otherwise stated at the time of activation:</p>
        <ul>
          <li>A valid payment method is required to start a free trial;</li>
          <li>At the end of the trial period, your subscription will automatically convert to a paid subscription at the then-current price unless you cancel before the trial ends;</li>
          <li>You will be notified before the trial converts to a paid subscription;</li>
          <li>Free trials are limited to one per Account and may not be combined with other promotional offers unless explicitly permitted.</li>
        </ul>
        <h4>Promotional Codes</h4>
        <p>We may issue promotional codes ("promo codes") that grant subscription access, entitlements, discounts, or trial periods. Promo codes:</p>
        <ul>
          <li>Are subject to any conditions specified at the time of issuance (such as audience restrictions, jurisdiction limitations, expiration dates, or usage limits);</li>
          <li>May not be sold, traded, or transferred unless explicitly permitted;</li>
          <li>May not be combined with other promo codes or offers unless explicitly permitted;</li>
          <li>May be revoked if obtained through fraud, error, or violation of these terms;</li>
          <li>Have no cash value and are not redeemable for cash.</li>
        </ul>
        <h4>Age Verification for Non-Payment Access</h4>
        <p>Free trials, promotional codes that grant subscription access, and any other mechanism that provides platform access without a direct payment may require successful age verification before activation. Subscription charges serve as one of several structural barriers against botting, abuse, and bad-faith signups at scale; when that barrier is bypassed (through a trial or promo code), age verification provides an alternative assurance that the Account belongs to a real, eligible person.</p>
      </>
    ),
  },
  {
    id: 'mfa-discount',
    title: 'Multi-Factor Authentication (MFA) Discount',
    content: (
      <>
        <p>We reward users who take steps to secure their Accounts by offering discounts on subscriptions, sponsorships, and purchases for enabling multi-factor authentication:</p>
        <ul>
          <li><strong>Standard MFA (2% discount):</strong> A 2% discount on subscription renewals and sponsorship purchases is applied to Accounts that have any form of MFA enabled and actively maintained (e.g., TOTP authenticator app or WebAuthn-compatible device).</li>
          <li><strong>Hardware Key MFA (5% discount):</strong> A 5% discount on <em>all</em> purchases (including subscriptions, sponsorships, and one-time purchases) is applied to Accounts that have hardware security key MFA enabled and actively maintained (e.g., YubiKey or similar FIDO2/WebAuthn device). This 5% is inclusive of the standard 2% — they do not stack.</li>
        </ul>
        <p>MFA discounts are applied automatically and remain in effect for as long as the qualifying MFA method is active on your Account. If you remove or disable the qualifying MFA method, the discount will be removed at your next billing event. Re-enabling MFA will re-apply the discount prospectively.</p>
        <blockquote>
          <p>Better security = lower price. Enable a hardware key and get 5% off everything. We feel very strongly about users' privacy and security, and want to encourage the right choices.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'sponsorships',
    title: 'Sponsorships',
    content: (
      <>
        <p>Adieuu allows users to sponsor subscriptions or purchases for other users. Sponsorships function as gifts — you purchase a subscription or product on behalf of another user.</p>
        <h4>How Sponsorships Work</h4>
        <ul>
          <li>Users seeking sponsorship may post a request to the Sponsorship Directory, visible to other users who may choose to fulfill it;</li>
          <li>Sponsors select a request and purchase the specified (or equivalent) product through our checkout flow;</li>
          <li>Sponsors may optionally reveal their first name and last initial to the recipient, or remain anonymous;</li>
          <li>Sponsorship purchases are subject to the same payment terms, taxes, and processing as any other purchase on Adieuu.</li>
        </ul>
        <h4>Sponsorship Terms</h4>
        <ul>
          <li>Sponsorships are non-refundable once fulfilled (the product has been activated on the recipient's Account);</li>
          <li>The sponsor has no ongoing obligation to the recipient (e.g., a sponsored annual subscription does not obligate the sponsor to renew for subsequent years);</li>
          <li>If a sponsored user's Account or Alias is terminated for violation of our Terms, the sponsor is not entitled to a refund;</li>
          <li>Sponsorship requests and fulfillments are subject to our Acceptable Use Policy — abuse of the sponsorship system (e.g., creating fraudulent requests, using sponsorships to launder funds, or coordinating sponsorships for ban evasion) is prohibited.</li>
        </ul>
        <blockquote>
          <p>Sponsorships are one of the ways we try to make Adieuu accessible to people who might not be able to afford a subscription on their own. It's a gift — no strings attached for either party.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'cancellations-and-refunds',
    title: 'Cancellations and Refunds',
    content: (
      <>
        <h4>Cancelling a Recurring Subscription</h4>
        <p>You may cancel your recurring subscription (Access or Insider) at any time through your Account settings. When you cancel:</p>
        <ul>
          <li>Your subscription remains active through the end of your current billing period;</li>
          <li>You will not be charged for subsequent renewal periods;</li>
          <li>At the end of your current billing period, you will lose access to your Aliases until you resubscribe.</li>
        </ul>
        <h4>Refunds for Recurring Subscriptions</h4>
        <p>Access and Insider are annual subscriptions priced to be as affordable as possible. As a general policy:</p>
        <ul>
          <li><strong>No pro-rata refunds</strong> are provided for recurring subscriptions (Access or Insider) that are cancelled mid-term. Your subscription remains active through the end of the paid period;</li>
          <li>We reserve the right to grant discretionary refunds or credits on a case-by-case basis at our sole discretion.</li>
        </ul>
        <h4>Refunds for Lifetime Purchases (Vanguard and Founder)</h4>
        <p>Because lifetime purchases grant permanent access, refunds are handled differently:</p>
        <ul>
          <li>If you request a refund for a lifetime purchase, we will refund the purchase price minus: (a) applicable payment processing fees, and (b) the value of any subscription time used, calculated at the then-current Insider annual rate on a pro-rata daily basis;</li>
          <li>Upon processing a lifetime refund, all entitlements and access granted by the lifetime purchase will be immediately and permanently revoked.</li>
        </ul>
        <h4>Refunds Upon Termination by Adieuu</h4>
        <p>If we terminate your Account or Alias for a violation of our Terms of Service, Acceptable Use Policy, or other policies:</p>
        <ul>
          <li><strong>No refund</strong> is provided for any unused subscription time or lifetime purchase amount. Violation of our terms forfeits any remaining prepaid balance.</li>
        </ul>
        <h4>Refunds Upon Self-Deletion</h4>
        <p>If you voluntarily delete your Account:</p>
        <ul>
          <li>For recurring subscriptions (Access or Insider): no refund is provided, as these are annual plans and inexpensive by design;</li>
          <li>For lifetime purchases (Vanguard or Founder): we will refund the purchase price minus applicable processing fees and the value of any subscription time used, calculated at the then-current Insider annual rate on a pro-rata daily basis.</li>
        </ul>
        <h4>Waiver of Right of Withdrawal (EU/EEA/UK)</h4>
        <p>Adieuu's Services constitute digital content and digital services that are supplied immediately upon purchase. By completing a purchase or activating a subscription, you expressly acknowledge and consent that:</p>
        <ul>
          <li>The digital content and/or digital service is made available to you immediately upon payment — including immediate access to your Aliases, platform features, and all tier-specific functionality;</li>
          <li>You expressly consent to the immediate performance of the service and acknowledge that you thereby waive your right of withdrawal under Directive 2011/83/EU (as amended by Directive 2019/2161), the UK Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013, or equivalent local legislation;</li>
          <li>This waiver is confirmed during the checkout process before payment is finalized.</li>
        </ul>
        <p>This consent is necessary because Adieuu's accountability model depends on the permanence of transactions. Allowing repeated purchase-and-refund cycles would enable users to create Aliases, engage in harmful behavior, refund, and repeat — undermining the structural accountability that protects all users on the platform.</p>
        <blockquote>
          <p>Annual plans are low-cost and non-refundable. Lifetime purchases can be refunded minus what you've used and processing fees if you leave voluntarily. If we terminate you for breaking the rules, there's no refund. EU/UK users: because access is delivered immediately, the standard 14-day withdrawal period does not apply — you'll confirm this at checkout.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'chargebacks',
    title: 'Chargebacks and Payment Disputes',
    content: (
      <>
        <p>If you believe a charge from Adieuu is unauthorized or incorrect, please contact us at <a href="mailto:say@adieuu.com" target="_blank" rel="noopener noreferrer">say@adieuu.com</a> before initiating a chargeback with your bank or card issuer. We are often able to resolve billing disputes faster and more favorably than the chargeback process.</p>
        <p>If you file a chargeback or payment dispute:</p>
        <ul>
          <li>We may immediately suspend access to your Account and Aliases pending resolution of the dispute;</li>
          <li>If the chargeback is resolved in our favor (i.e., the charge is determined to be valid), you may be responsible for any fees assessed to us by our payment processor as a result of the dispute;</li>
          <li>Filing a fraudulent or bad-faith chargeback (i.e., disputing a legitimate charge you authorized) constitutes a violation of our Terms of Service and may result in permanent termination of your Account.</li>
        </ul>
        <blockquote>
          <p>Talk to us first — we'll work with you. Filing a chargeback on a charge you made is fraud and will result in account termination.</p>
        </blockquote>
      </>
    ),
  },
  {
    id: 'changes-to-these-terms',
    title: 'Changes to These Terms',
    content: (
      <>
        <p>We may update these Paid Services Terms from time to time to reflect new products, pricing changes, legal requirements, or clarifications. Material changes will be communicated in accordance with the "Modifications" section of our Terms of Service. Changes to pricing are additionally governed by the "Pricing Changes" section above.</p>
        <p>If you have questions about these terms, please contact us at <a href="mailto:say@adieuu.com" target="_blank" rel="noopener noreferrer">say@adieuu.com</a>.</p>
      </>
    ),
  },
];

interface ContentProps {
  highContrast?: boolean;
  onToggleHighContrast?: () => void;
}

export function PaidServicesTermsContent({ highContrast, onToggleHighContrast }: ContentProps) {
  return (
    <LegalPolicyDocument
      sections={PAID_SERVICES_SECTIONS}
      highContrast={highContrast}
      onToggleHighContrast={onToggleHighContrast}
    />
  );
}

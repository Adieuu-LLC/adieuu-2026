/**
 * Sponsorship fulfillment notifications.
 *
 * Sends email and/or SMS to the beneficiary when a sponsorship is fulfilled.
 * Follows the same fire-and-forget pattern as compliance-notification.ts.
 *
 * @module services/sponsorship-notification
 */

import { config } from '../config';
import { DEFAULT_LOCALE, getEmailTemplate, getSmsMessage } from '../i18n';
import type { UserDocument } from '../models/user';
import type { PurchasableProductId } from '@adieuu/shared';
import { sendEmail, sendSms } from './messaging';
import elog from '../utils/adieuuLogger';

const APP_NAME = config.email.fromName;

const PLAN_DISPLAY_NAMES: Record<PurchasableProductId, string> = {
  access: 'Access',
  insider: 'Insider',
  vanguard: 'Vanguard',
  founder: 'Founder',
};

export interface SponsorshipFulfilledNotificationParams {
  productId: PurchasableProductId;
  isLifetime: boolean;
  sponsorRevealed: boolean;
  sponsorFirstName?: string;
  sponsorLastInitial?: string;
}

export async function sendSponsorshipFulfilledNotification(
  beneficiary: UserDocument,
  params: SponsorshipFulfilledNotificationParams,
): Promise<void> {
  const {
    productId,
    isLifetime,
    sponsorRevealed,
    sponsorFirstName,
    sponsorLastInitial,
  } = params;

  const planName = PLAN_DISPLAY_NAMES[productId] ?? productId;
  const durationLine = isLifetime
    ? 'This is a lifetime plan with permanent access.'
    : 'This plan is active for 12 months.';
  const sponsorLine =
    sponsorRevealed && sponsorFirstName
      ? `Sponsored by: ${sponsorFirstName} ${sponsorLastInitial ?? ''}.`.trim()
      : 'Your sponsor chose to remain anonymous.';

  const userId = beneficiary._id.toHexString();

  try {
    if (beneficiary.email && beneficiary.emailVerified) {
      const template = getEmailTemplate('sponsorshipFulfilled', DEFAULT_LOCALE, {
        appName: APP_NAME,
        planName,
        durationLine,
        sponsorLine,
      });
      await sendEmail({
        to: beneficiary.email,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });
      elog.info('Sponsorship fulfilled email sent', { userId });
    }

    if (beneficiary.phone && beneficiary.phoneVerified) {
      const message = getSmsMessage('sponsorshipFulfilled', DEFAULT_LOCALE, {
        appName: APP_NAME,
        planName,
      });
      await sendSms({ to: beneficiary.phone, message });
      elog.info('Sponsorship fulfilled SMS sent', { userId });
    }
  } catch (err) {
    elog.warn('Failed to send sponsorship fulfilled notification', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

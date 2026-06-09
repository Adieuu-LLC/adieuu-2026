/**
 * Notifies users when their account is accessed from a known abusive IP.
 */

import { config } from '../../config';
import { DEFAULT_LOCALE, getEmailTemplate, getSmsMessage } from '../../i18n';
import type { UserDocument } from '../../models/user';
import { sendEmail, sendSms } from '../messaging';
import elog from '../../utils/adieuuLogger';

const APP_NAME = config.email.fromName;

export async function sendAbusiveIpAccessNotification(user: UserDocument): Promise<void> {
  try {
    if (user.email && user.emailVerified) {
      const template = getEmailTemplate('abusiveIpAccess', DEFAULT_LOCALE, { appName: APP_NAME });
      await sendEmail({
        to: user.email,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });
      elog.info('Abusive IP access notification email sent', { userId: user._id.toHexString() });
      return;
    }

    if (user.phone && user.phoneVerified) {
      const message = getSmsMessage('abusiveIpAccess', DEFAULT_LOCALE, { appName: APP_NAME });
      await sendSms({ to: user.phone, message });
      elog.info('Abusive IP access notification SMS sent', { userId: user._id.toHexString() });
    }
  } catch (err) {
    elog.warn('Failed to send abusive IP access notification', {
      userId: user._id.toHexString(),
      error: err,
    });
  }
}

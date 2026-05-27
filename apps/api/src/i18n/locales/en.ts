/**
 * English locale translations.
 *
 * @module i18n/locales/en
 */

import type { LocaleTranslations } from '../types';

export const en: LocaleTranslations = {
  locale: 'en',
  name: 'English',

  emails: {
    otp: {
      subject: 'Your {{appName}} login code is {{otp}}',
      text: `Your login code is: {{otp}}

This code expires in {{expiresInMinutes}} minutes.

If you didn't request this code, you can safely ignore this email.`,
      html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
  <h2 style="color: #1a1a1a; margin-bottom: 24px;">Your {{appName}} login code</h2>
  <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0; color: #2563eb; font-family: monospace;">
    {{otp}}
  </p>
  <p style="color: #666; font-size: 14px; margin-top: 24px;">
    This code expires in {{expiresInMinutes}} minutes.
  </p>
  <p style="color: #999; font-size: 12px; margin-top: 16px;">
    If you didn't request this code, you can safely ignore this email.
  </p>
</div>`,
    },

    otpWithMagicLink: {
      subject: 'Your {{appName}} login code is {{otp}}',
      text: `Your login code is: {{otp}}

Or click this link to sign in: {{magicLink}}

This code expires in {{expiresInMinutes}} minutes.

If you didn't request this code, you can safely ignore this email.`,
      html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
  <h2 style="color: #1a1a1a; margin-bottom: 24px;">Your {{appName}} login code</h2>
  <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0; color: #2563eb; font-family: monospace;">
    {{otp}}
  </p>
  <p style="color: #666; margin: 16px 0;">Or click the button below to sign in:</p>
  <a href="{{magicLink}}" style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 500; margin: 8px 0;">
    Sign in to {{appName}}
  </a>
  <p style="color: #666; font-size: 14px; margin-top: 24px;">
    This code expires in {{expiresInMinutes}} minutes.
  </p>
  <p style="color: #999; font-size: 12px; margin-top: 16px;">
    If you didn't request this code, you can safely ignore this email.
  </p>
</div>`,
    },

    otpAccountAdd: {
      subject: 'Verify your email change: {{otp}} - {{appName}}',
      text: `Someone is attempting to add this email address to their {{appName}} account.

If this was you, enter this code to verify: {{otp}}

This code expires in {{expiresInMinutes}} minutes.

If you didn't request this, you can safely ignore this email. No changes will be made to any account.`,
      html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
  <h2 style="color: #1a1a1a; margin-bottom: 24px;">Verify your email</h2>
  <p style="color: #1a1a1a; line-height: 1.6;">
    Someone is attempting to add this email address to their {{appName}} account.
  </p>
  <p style="color: #666; line-height: 1.6; margin-top: 16px;">
    If this was you, enter this code to verify:
  </p>
  <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0; color: #2563eb; font-family: monospace;">
    {{otp}}
  </p>
  <p style="color: #666; font-size: 14px; margin-top: 24px;">
    This code expires in {{expiresInMinutes}} minutes.
  </p>
  <p style="color: #999; font-size: 12px; margin-top: 16px;">
    If you didn't request this, you can safely ignore this email. No changes will be made to any account.
  </p>
</div>`,
    },

    accountLocked: {
      subject: '{{appName}} account security alert',
      text: `Your {{appName}} account has been temporarily locked due to multiple failed login attempts.

This is a security measure to protect your account.

If this was you, please wait {{lockoutMinutes}} minutes before trying again.

If this wasn't you, someone may be trying to access your account. Your account is secure, but consider changing your password when you next sign in.`,
      html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
  <h2 style="color: #dc2626; margin-bottom: 24px;">Account Security Alert</h2>
  <p style="color: #1a1a1a; line-height: 1.6;">
    Your {{appName}} account has been temporarily locked due to multiple failed login attempts.
  </p>
  <p style="color: #666; line-height: 1.6; margin-top: 16px;">
    This is a security measure to protect your account.
  </p>
  <p style="color: #666; line-height: 1.6; margin-top: 16px;">
    If this was you, please wait <strong>{{lockoutMinutes}} minutes</strong> before trying again.
  </p>
  <p style="color: #666; line-height: 1.6; margin-top: 16px;">
    If this wasn't you, someone may be trying to access your account. Your account is secure, but consider reviewing your account security when you next sign in.
  </p>
</div>`,
    },

    failedLoginAttempts: {
      subject: '{{appName}} security notice',
      text: `We noticed {{attemptCount}} failed login attempts on your {{appName}} account.

If this was you, you can disregard this message.

If this wasn't you, your account is still secure. No action is required, but we wanted to let you know.`,
      html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
  <h2 style="color: #f59e0b; margin-bottom: 24px;">Security Notice</h2>
  <p style="color: #1a1a1a; line-height: 1.6;">
    We noticed <strong>{{attemptCount}} failed login attempts</strong> on your {{appName}} account.
  </p>
  <p style="color: #666; line-height: 1.6; margin-top: 16px;">
    If this was you, you can disregard this message.
  </p>
  <p style="color: #666; line-height: 1.6; margin-top: 16px;">
    If this wasn't you, your account is still secure. No action is required, but we wanted to let you know.
  </p>
</div>`,
    },

    welcome: {
      subject: 'Welcome to {{appName}}!',
      text: `Welcome to {{appName}}!

We're excited to have you. Your account has been created successfully.

If you have any questions, feel free to reach out to our support team.`,
      html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
  <h2 style="color: #2563eb; margin-bottom: 24px;">Welcome to {{appName}}!</h2>
  <p style="color: #1a1a1a; line-height: 1.6;">
    We're excited to have you. Your account has been created successfully.
  </p>
  <p style="color: #666; line-height: 1.6; margin-top: 16px;">
    If you have any questions, feel free to reach out to our support team.
  </p>
</div>`,
    },

    passwordChanged: {
      subject: 'Your {{appName}} password was changed',
      text: `Your {{appName}} account password was recently changed.

If you made this change, no further action is needed.

If you didn't make this change, please contact our support team immediately.`,
      html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
  <h2 style="color: #1a1a1a; margin-bottom: 24px;">Password Changed</h2>
  <p style="color: #1a1a1a; line-height: 1.6;">
    Your {{appName}} account password was recently changed.
  </p>
  <p style="color: #666; line-height: 1.6; margin-top: 16px;">
    If you made this change, no further action is needed.
  </p>
  <p style="color: #dc2626; line-height: 1.6; margin-top: 16px;">
    If you didn't make this change, please contact our support team immediately.
  </p>
</div>`,
    },
  },

  sms: {
    otp: '{{appName}} code: {{otp}}. Expires in {{expiresInMinutes}} min.',
    otpAccountAdd: '{{appName}}: Someone is adding this phone to their account. Code: {{otp}}. Expires in {{expiresInMinutes}} min. Ignore if not you.',
    accountLocked: '{{appName}}: Account locked due to failed login attempts. Try again in {{lockoutMinutes}} min.',
    failedLoginAttempts: '{{appName}}: {{attemptCount}} failed login attempts detected on your account.',
  },

  errors: {
    badRequest: 'Bad request',
    unauthorized: 'Unauthorized',
    forbidden: 'You do not have permission to perform this action',
    notFound: 'Not found',
    methodNotAllowed: 'Method not allowed',
    rateLimited: 'Too many requests. Please try again later.',
    conflict: 'This resource already exists or conflicts with the current state.',
    internal: 'An unexpected error occurred. Please try again.',
    validationFailed: 'Validation failed. Please check your input.',
    invalidEmail: 'Please enter a valid email address',
    invalidPhone: 'Please enter a valid phone number',
    // IMPORTANT: These verification messages are intentionally identical to prevent enumeration.
    // Attackers should not be able to distinguish between:
    // - Invalid code vs. expired code
    // - Non-existent OTP vs. wrong code
    // - Locked OTP vs. wrong code
    // All verification failures return the same generic message.
    // Use 'verificationFailed' as the canonical key for OTP verification responses.
    verificationFailed: 'Unable to verify. Please check your code or request a new one.',
    invalidOtp: 'Unable to verify. Please check your code or request a new one.',
    otpExpired: 'Unable to verify. Please check your code or request a new one.',
    tooManyAttempts: 'Unable to verify. Please check your code or request a new one.',
    accountBanned: 'This account has been permanently banned.',
    accountSuspended: 'This account is currently suspended.',
    // accountLocked is for ACCOUNT-level lockouts sent via email/SMS notifications,
    // NOT for OTP verification failures (which use the generic messages above)
    accountLocked: 'Account temporarily locked. Please try again later.',
    sessionExpired: 'Your session has expired. Please sign in again.',
    payloadTooLargeGeneric: 'Request too large. Please reduce the size of your request.',
    payloadTooLarge:
      'Request body exceeds the maximum size ({{maxKb}} KiB, {{maxBytes}} bytes). Shorten the message or reduce the number of recipient devices.',
    alreadyOwned: 'This is already attached to another Adieuu account. You may have signed up with it previously.',
    signInRestricted: 'Sign-in is restricted to an allowlist. This is temporary. IYKYK.',
  },
};

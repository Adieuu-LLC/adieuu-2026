/**
 * Account sign-in (email/phone OTP) copy.
 */
export const auth = {
    login: {
      title: 'Sign in to Adieuu',
      subtitle: 'Enter your email or phone to receive a verification code.',
      emailPlaceholder: 'Email or phone number',
      submitButton: 'Send code',
      sending: 'Sending...',
    },
    verify: {
      title: 'Enter verification code',
      subtitle: 'We sent a code to {{identifier}}',
      verifyButton: 'Verify',
      verifying: 'Verifying...',
      resendCode: 'Resend code',
      changeIdentifier: 'Use a different email or phone',
    },
    restriction: {
      bannedTitle: 'Account Permanently Banned',
      suspendedTitle: 'Account Suspended',
      bannedClubWithCategory:
        "You and {{count}} other accounts are banned for {{category}}.",
      bannedClubTotal:
        "You and {{count}} other accounts are permanently banned from Adieuu.",
      suspendedSubtitle: 'Your account access is temporarily restricted.',
      reason: 'Reason',
      timeRemaining: 'Time remaining',
      expiredMessage: 'Your suspension has expired. You may sign in again. Be better.',
      backToLogin: 'Back to sign in',
      appealMessage: 'If you believe this was made in error, you may appeal by emailing',
      appealEmail: 'consequences@adieuu.com',
      appealInstructions: 'with your account details.',
      category: {
        tos_violation: 'ToS violations',
        spam: 'spam',
        harassment: 'harassment',
        hate_speech: 'hate speech',
        violence: 'violence',
        illegal_content: 'illegal content',
        csam: 'child safety violations',
        impersonation: 'impersonation',
        fraud: 'fraud',
        security_abuse: 'security abuse',
        other: 'policy violations',
      },
    },
} as const;

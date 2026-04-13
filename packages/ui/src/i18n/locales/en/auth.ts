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
} as const;

/**
 * User-facing abuse / content reports.
 */
export const report = {
    title: 'Report',
    reportMessage: 'Report Message',
    reportProfile: 'Report Profile',
    categoryLabel: 'Category',
    categoryPlaceholder: 'Select a reason...',
    categories: {
      harassment: 'Harassment or bullying',
      spam: 'Spam or unwanted content',
      impersonation: 'Impersonation',
      violence: 'Violence or threats',
      csam: 'Child safety concern',
      illegal_content: 'Illegal content',
      other: 'Other',
    },
    reasonLabel: 'Additional details (optional)',
    reasonPlaceholder: 'Describe what happened...',
    consentStepTitle: 'Privacy disclosure',
    messageConsent:
      'By submitting this report, the reported message and up to 3 surrounding messages will be decrypted and shared with platform moderators in plaintext, including any media attachments. No other messages will be affected.',
    profileConsent:
      "The reported profile's current display name, bio, and avatar will be shared with moderators.",
    next: 'Next',
    cancel: 'Cancel',
    submit: 'Submit Report',
    submitting: 'Submitting...',
    success: 'Report submitted. Thank you.',
    errorGeneric: 'Failed to submit report. Please try again.',
    errorDuplicate: 'You have already reported this.',
    errorRateLimit: 'Too many reports. Please try again later.',
    errorDecryption: 'Unable to verify message evidence. Please try again.',
} as const;

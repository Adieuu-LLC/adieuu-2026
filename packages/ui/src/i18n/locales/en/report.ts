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
    contextLabel: 'Surrounding messages',
    contextHint:
      'How many messages to include on each side of the reported one (the same number before and after).',
    contextOption: '{{count}} before and after',
    consentStepTitle: 'Privacy disclosure',
    messageConsentDynamic:
      'By submitting this report, the reported message and up to {{count}} messages before and after it will be decrypted and shared with platform moderators in plaintext, including uploaded media, GIFs, stickers, and any other content in those messages. No other messages will be affected.',
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
    errorSessionExpired: 'Your session expired. Please sign in again and try submitting the report.',
    errorNetwork: 'Could not reach the server. Check your connection and try again.',
    errorTimeout: 'The request took too long. Please try again.',
    errorNoConversation: 'Could not load this report from the current chat. Open the conversation and try again.',
} as const;

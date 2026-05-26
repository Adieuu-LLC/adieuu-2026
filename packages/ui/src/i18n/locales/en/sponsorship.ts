export const sponsorship = {
  sponsorship: {
    request: {
      heading: 'Request sponsorship',
      description:
        'If you cannot afford a subscription, you may request sponsorship from the community. Another user may choose to sponsor your plan.',
      consentHeading: 'What will be visible',
      consentBody:
        'The following information will be publicly visible to other logged-in users in the sponsorship directory:',
      consentItems: {
        name: 'Your first name and last initial',
        jurisdiction: 'Your jurisdiction (country or region)',
        message: 'Your optional message',
        preference: 'Your plan preference (if provided)',
      },
      consentAcknowledge:
        'You can withdraw your request at any time. You may only request sponsorship once.',
      firstNameLabel: 'First name',
      firstNamePlaceholder: 'Enter your first name',
      lastInitialLabel: 'Last initial',
      lastInitialPlaceholder: 'e.g. D',
      messageLabel: 'Message (optional)',
      messagePlaceholder: 'Tell potential sponsors why you need help (max 280 characters)',
      preferenceLabel: 'Plan preference (optional)',
      preferencePlaceholder: 'No preference',
      submit: 'Submit request',
      submitting: 'Submitting...',
      successHeading: 'Request submitted',
      successBody:
        'Your request is now visible in the sponsorship directory. You will be notified if someone sponsors you.',
    },
    status: {
      heading: 'Your sponsorship request',
      active: 'Active',
      fulfilled: 'Fulfilled',
      withdrawn: 'Withdrawn',
      createdAt: 'Submitted on {{date}}',
      fulfilledAt: 'Sponsored on {{date}}',
      fulfilledProduct: 'Plan received: {{product}}',
      sponsorRevealedBy: 'Sponsored by {{name}}',
      withdrawButton: 'Withdraw request',
      withdrawConfirm: 'Are you sure you want to withdraw your sponsorship request?',
    },
    directory: {
      heading: 'Sponsorship directory',
      description:
        'These users have requested sponsorship. You may sponsor any of them with any plan.',
      emptyHeading: 'No requests',
      emptyBody: 'There are no active sponsorship requests at this time.',
      loadMore: 'Load more',
      cardJurisdiction: '{{jurisdiction}}',
      cardPreference: 'Prefers: {{product}}',
      cardDate: 'Requested {{date}}',
      sponsorButton: 'Sponsor',
    },
    checkout: {
      heading: 'Sponsor {{name}}',
      description: 'Choose a plan to give to {{name}}.',
      planLabel: 'Plan',
      revealLabel: 'Reveal your identity to them?',
      revealHint:
        'If enabled, the recipient will see your first name and last initial after checkout.',
      revealFirstNameLabel: 'Your first name',
      revealLastInitialLabel: 'Your last initial',
      annualNote: 'This grants 12 months of access (no recurring billing for the recipient).',
      lifetimeNote: 'This grants permanent lifetime access.',
      checkoutButton: 'Continue to payment',
      processing: 'Processing...',
    },
    sidebar: {
      expiryBanner: 'Your subscription expires on {{date}}.',
      expiryAction: 'Subscribe or reapply for sponsorship.',
    },
    errors: {
      hasSubscription: 'You already have an active subscription.',
      alreadyRequested: 'You already have a sponsorship request.',
      requestNotFound: 'This sponsorship request is no longer available.',
      selfSponsor: 'You cannot sponsor your own request.',
      generic: 'Something went wrong. Please try again.',
    },
  },
} as const;

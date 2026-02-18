/**
 * English translations for the Chadder UI.
 */
export const en = {
  // Common
  common: {
    loading: 'Loading...',
    error: 'Error',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    submit: 'Submit',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    notSet: 'Not set',
    retry: 'Retry',
  },

  // Navigation
  nav: {
    home: 'Home',
    about: 'About',
    account: 'Account',
    logout: 'Account Logout',
    expandSidebar: 'Expand sidebar',
    collapseSidebar: 'Collapse sidebar',
  },

  // Sidebar sections
  sidebar: {
    main: 'Main',
    account: 'Account',
    identity: 'Identity',
  },

  // Identity
  identity: {
    title: 'Anonymous Identity',
    notLoggedIn: 'Not logged in',
    loginButton: 'Login to Identity',
    createButton: 'Create Identity',
    logoutButton: 'Identity Logout',
    loggedInAs: 'Logged in as',
    // Create modal
    create: {
      title: 'Create Anonymous Identity',
      subtitle: 'Your identity is cryptographically separated from your account. No one can trace it back to you.',
      passphrasePlaceholder: 'Enter a memorable passphrase',
      passphraseConfirmPlaceholder: 'Confirm your passphrase',
      passphraseHint: 'Use a sentence or phrase (8+ characters). You will need this to login.',
      passphraseMismatch: 'Passphrases do not match.',
      passphraseExamplesTitle: 'Strong Passphrase Examples',
      passphraseExamples: [
        'the purple elephant dances at midnight',
        'my coffee is always too hot on tuesdays',
        'three blind mice ran up the clock tower',
        'sunshine through the kitchen window 2024',
      ],
      passphraseExamplesTip: 'Sentences and phrases are easier to remember and harder to crack than random characters.',
      // Passphrase strength hints
      passphraseStrength: {
        match: 'Passphrases match',
        weak: 'Could be stronger - try adding more words',
        medium: 'Good, but a longer phrase is even better',
        strong: 'Strong passphrase',
        veryStrong: 'Excellent passphrase',
      },
      usernamePlaceholder: 'Choose a username',
      usernameHint: 'This will be visible to others.',
      displayNamePlaceholder: 'Display name',
      displayNameHint: 'How you appear in conversations.',
      submitButton: 'Create Identity',
      creating: 'Creating...',
      success: 'Identity created successfully! You can now login.',
      errorUsernameTaken: 'This username is already taken.',
      errorMaxIdentities: 'You have reached the maximum number of identities.',
      errorValidation: 'Please check your input and try again.',
      noRecoveryWarning: 'There is no recovery option for your passphrase. Make sure you remember it!',
    },
    // Login modal
    login: {
      title: 'Login to Identity',
      subtitle: 'Enter your passphrase to access your anonymous identity.',
      passphrasePlaceholder: 'Enter your passphrase',
      submitButton: 'Login',
      loggingIn: 'Logging in...',
      success: 'Logged in successfully!',
      errorInvalid: 'Invalid passphrase. Please try again.',
      errorLocked: 'Too many failed attempts. Please try again later.',
      errorRateLimited: 'Please wait {{seconds}} seconds before trying again.',
      attemptsRemaining: '{{remaining}} attempts remaining before lockout.',
      noIdentity: "You don't have an identity yet.",
      createPrompt: 'Create one to get started.',
    },
    // Delete confirmation
    delete: {
      title: 'Delete Identity',
      warning: 'This action cannot be undone. Your identity will be permanently deleted.',
      confirmButton: 'Delete Identity',
    },
  },

  // Account pages
  account: {
    // Overview
    overview: {
      title: 'Account Overview',
      subtitle: 'Manage your account details and preferences.',
      email: 'Email',
      phone: 'Phone',
      accountStanding: 'Account Standing',
      role: 'Role',
      statusGood: 'Good',
      statusSuspended: 'Suspended',
      statusRestricted: 'Restricted',
      roleUser: 'User',
      roleAdmin: 'Admin',
      roleModerator: 'Moderator',
      // Edit/Add contact info
      add: 'Add',
      sendCode: 'Send Code',
      verify: 'Verify',
      codeSent: 'Verification code sent.',
      enterCodeFor: 'Enter the code sent to',
      enterEmail: 'Enter email address',
      enterPhone: 'Enter phone number',
      emailVerified: 'Email verified successfully.',
      phoneVerified: 'Phone verified successfully.',
      invalidCode: 'Invalid verification code. Please try again.',
      errorSendingCode: 'Failed to send verification code.',
      alreadyOwned: 'This is already attached to another Chadder account. You may have signed up with it previously.',
      // Verification tooltips
      verified: 'Verified',
      emailNotVerifiedTooltip: 'Email not yet verified. Add and verify to use this as login.',
      phoneNotVerifiedTooltip: 'Phone not yet verified. Add and verify to use this as login.',
      emailUnchanged: 'Enter a different email address to change it.',
      phoneUnchanged: 'Enter a different phone number to change it.',
    },

    // Appearance
    appearance: {
      title: 'Appearance',
      subtitle: 'Customize how Chadder looks and feels.',
      comingSoon: 'Appearance settings coming soon.',
      theme: 'Theme',
      themeDark: 'Dark',
      themeLight: 'Light',
      themeSystem: 'System',
      sidebarPosition: 'Sidebar Position',
      sidebarLeft: 'Left',
      sidebarRight: 'Right',
      fontSize: 'Font Size',
      fontSizeSmall: 'Small',
      fontSizeMedium: 'Medium',
      fontSizeLarge: 'Large',
    },

    // Security
    security: {
      title: 'Security',
      subtitle: 'Manage your security settings and active sessions.',
      // Tabs
      tabs: {
        authentication: 'Authentication',
        sessions: 'Sessions',
      },
      // Authentication tab
      authentication: {
        title: 'Authentication Settings',
        comingSoon: 'Authentication settings coming soon.',
        encryptionKeys: 'Encryption Keys',
        twoFactor: 'Two-Factor Authentication',
      },
      // Sessions tab
      sessions: {
        title: 'Active Sessions',
        description: 'These are the devices currently logged into your account. You can revoke access to any session.',
        currentSession: 'Current session',
        lastActive: 'Last active',
        created: 'Created',
        revokeSession: 'Revoke',
        revokeAllOthers: 'Revoke all other sessions',
        revokeAllConfirm: 'Are you sure you want to log out of all other devices?',
        noOtherSessions: 'No other active sessions.',
        sessionRevoked: 'Session revoked successfully.',
        allSessionsRevoked: '{{count}} session(s) revoked successfully.',
        unknownDevice: 'Unknown device',
        unknownLocation: 'Unknown location',
      },
    },

    // Privacy
    privacy: {
      title: 'Privacy',
      subtitle: 'Control your privacy settings and who can contact you.',
      comingSoon: 'Privacy settings coming soon.',
      blockedUsers: 'Blocked Users',
      profileVisibility: 'Profile Visibility',
      readReceipts: 'Read Receipts',
      typingIndicators: 'Typing Indicators',
      lastSeen: 'Last Seen',
    },

    // Notifications
    notifications: {
      title: 'Notifications',
      subtitle: 'Configure how and when you receive notifications.',
      comingSoon: 'Notification settings coming soon.',
      pushNotifications: 'Push Notifications',
      emailNotifications: 'Email Notifications',
      soundEnabled: 'Sound Enabled',
      desktopNotifications: 'Desktop Notifications',
      messagePreview: 'Message Preview',
    },
  },

  // About page
  about: {
    title: 'About Chadder',
    subtitle: 'Secure, private messaging for everyone.',
    missionTitle: 'Our Mission',
    missionText1: "Chadder was built with privacy at its core. We believe that private communication is a fundamental right, not a luxury. Our platform uses end-to-end encryption to ensure that your messages remain private between you and your intended recipients.",
    missionText2: "Unlike other messaging platforms, we don't sell your data, track your conversations, or serve you targeted ads. Your privacy is not our business model.",
    securityTitle: 'Security',
    securityText: 'All messages are encrypted using industry-standard cryptographic algorithms. Our passwordless authentication system eliminates the risk of password breaches while providing a seamless user experience.',
    desktopTitle: 'Desktop App',
    desktopText: 'The Chadder desktop app is built with Electron, providing a native experience on Windows, macOS, and Linux. It shares the same secure codebase as our web application, ensuring consistent security across all platforms.',
  },

  // Home page
  home: {
    title: 'Welcome to Chadder',
    subtitle: 'Your secure messaging platform. Running on {{platform}}.',
    features: {
      encryption: {
        title: 'End-to-End Encryption',
        description: 'All messages are encrypted with strong cryptography. Only you and your recipients can read them.',
      },
      crossPlatform: {
        title: 'Cross-Platform',
        description: 'Access your messages from web, desktop, or mobile. Stay connected wherever you are.',
      },
      nativeDesktop: {
        title: 'Native Desktop App',
        description: 'Experience Chadder as a native desktop application with system notifications and offline support.',
      },
      passwordless: {
        title: 'No Password Required',
        description: 'Passwordless authentication keeps your account secure without the hassle of remembering passwords.',
      },
      privacy: {
        title: 'Privacy First',
        description: "We collect only what's necessary. Your data is yours.",
      },
    },
  },

  // Auth pages
  auth: {
    login: {
      title: 'Sign in to Chadder',
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
  },
} as const;

export type TranslationKeys = typeof en;

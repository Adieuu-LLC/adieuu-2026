/**
 * English translations for the Adieuu UI.
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
    remove: 'Remove',
    notSet: 'Not set',
    retry: 'Retry',
    duplicate: 'Duplicate',
    share: 'Share',
    copy: 'Copy',
    comingSoon: 'Coming soon',
  },

  // Navigation
  nav: {
    home: 'Home',
    about: 'About',
    account: 'Account',
    logout: 'Logout',
    expandSidebar: 'Expand sidebar',
    collapseSidebar: 'Collapse sidebar',
  },

  // Sidebar sections
  sidebar: {
    main: 'Main',
    account: 'Account',
    identity: 'Identity',
    comingSoon: '{{feature}} coming soon.',
    tabs: {
      friends: 'Friends',
      conversations: 'Conversations',
      spaces: 'Spaces',
    },
    friends: {
      loginRequired: 'Log in to see your friends.',
      error: 'Failed to load friends.',
      empty: 'No friends yet.',
      findFriends: 'Find friends',
    },
    conversations: {
      loginRequired: 'Log in to see your conversations.',
      error: 'Failed to load conversations.',
      empty: 'No conversations yet.',
    },
  },

  // Conversation Page
  conversation: {
    loginRequired: 'Log in to view this conversation.',
    notFound: 'Conversation not found.',
    goHome: 'Go Home',
    unknown: 'Unknown',
    memberCount: '{{count}} members',
    memberCount_one: '1 member',
    memberCount_other: '{{count}} members',
    toggleMembers: 'Toggle members',
    close: 'Close conversation',
    members: 'Members',
    profile: 'Profile',
    viewProfile: 'View Profile',
    messagesPlaceholder: 'Messages will appear here.',
    noMessages: 'No messages yet. Say hi to {{name}}!',
    inputPlaceholder: 'Type a message...',
    send: 'Send',
  },

  // Messages (MessageList component)
  messages: {
    loading: 'Loading messages...',
    noMessages: 'No messages yet.',
    startConversation: 'Start the conversation by sending a message.',
    loadMore: 'Load more',
    decryptionFailed: 'Could not decrypt message',
    deleted: 'This message was deleted.',
    actions: 'Message actions',
    deleteForEveryone: 'Delete for everyone',
    deleteForMe: 'Delete for me',
    expiresIn: 'Expires in',
    composerPlaceholder: 'Type a message...',
    composerAriaLabel: 'Message input',
    send: 'Send',
    ttl: {
      select: 'Set message expiry',
      header: 'Message expires after',
      never: 'Never',
      '30s': '30 seconds',
      '60s': '1 minute',
      '3m': '3 minutes',
      '5m': '5 minutes',
      '10m': '10 minutes',
      '30m': '30 minutes',
      '1h': '1 hour',
      '6h': '6 hours',
      '1d': '1 day',
      '3d': '3 days',
      '1w': '1 week',
    },
  },

  // Search
  search: {
    title: 'Search',
    subtitle: 'Find people by username or display name.',
    placeholder: 'Search for people...',
    noResults: 'No results found.',
    noResultsHint: 'Try a different search term or check the spelling.',
    hint: 'Enter a username or display name to search.',
    viewAll: 'View all results',
    resultsCount: '{{count}} result(s) found',
    resultsCount_one: '1 result found',
    resultsCount_other: '{{count}} results found',
    actions: {
      viewProfile: 'View Profile',
      message: 'Message',
      addFriend: 'Add Friend',
      signInToAddFriend: 'Sign in to add friend',
    },
  },

  // Friends
  friends: {
    title: 'Friends',
    subtitle: 'Manage your friends and friend requests.',
    noFriends: 'No friends yet.',
    noFriendsHint: 'Send friend requests to connect with people.',
    friendsSince: 'Friends since {{date}}',
    // Actions
    actions: {
      addFriend: 'Add Friend',
      cancelRequest: 'Cancel Request',
      requestSent: 'Request Sent',
      acceptRequest: 'Accept',
      ignoreRequest: 'Ignore',
      removeFriend: 'Remove Friend',
      friends: 'Friends',
      signInToAddFriend: 'Sign in to add friend',
    },
    // Friend requests
    requests: {
      title: 'Friend Requests',
      incoming: 'Incoming',
      sent: 'Sent',
      noIncoming: 'No incoming requests.',
      noSent: 'No sent requests.',
      accept: 'Accept',
      ignore: 'Ignore',
      cancel: 'Cancel',
    },
    // Messages
    messages: {
      requestSent: 'Friend request sent.',
      requestCancelled: 'Friend request cancelled.',
      requestAccepted: 'Friend request accepted.',
      requestIgnored: 'Friend request ignored.',
      friendRemoved: 'Friend removed.',
      alreadyFriends: 'You are already friends.',
      mutualAdd: 'You are now friends!',
    },
    // Errors
    errors: {
      sendFailed: 'Failed to send friend request.',
      cancelFailed: 'Failed to cancel friend request.',
      acceptFailed: 'Failed to accept friend request.',
      ignoreFailed: 'Failed to ignore friend request.',
      removeFailed: 'Failed to remove friend.',
      burstLimit: 'Please wait before sending more requests.',
    },
  },

  // Notifications
  notifications: {
    title: 'Notifications',
    subtitle: 'Your notifications and alerts.',
    noNotifications: 'No notifications.',
    markAllRead: 'Mark all as read',
    clearAll: 'Clear all',
    // Notification types
    types: {
      friend_request_received: '{{name}} sent you a friend request',
      friend_request_accepted: '{{name}} accepted your friend request',
      friendship_established: 'You are now friends with {{name}}',
      message_received: '{{name}} sent you a message',
      mention: '{{name}} mentioned you',
    },
    // Time formatting
    time: {
      justNow: 'Just now',
      minutesAgo: '{{count}}m ago',
      hoursAgo: '{{count}}h ago',
      daysAgo: '{{count}}d ago',
    },
    // Toast notifications
    toast: {
      friendRequestTitle: 'Friend Request',
      friendRequestDescription: '{{name}} sent you a friend request',
      friendAcceptedTitle: 'Friend Request Accepted',
      friendAcceptedDescription: '{{name}} accepted your friend request',
      friendshipTitle: 'New Friend',
      friendshipDescription: 'You are now friends with {{name}}',
      newNotificationTitle: 'New Notification',
      newNotificationDescription: 'You have a new notification',
    },
  },

  // Blocked users
  blocked: {
    title: 'Blocked Identities',
    subtitle: 'Manage identities you have blocked.',
    noBlocked: 'No blocked identities.',
    unblock: 'Unblock',
    blockUser: 'Block',
    confirmBlock: 'Are you sure you want to block this user?',
    confirmUnblock: 'Are you sure you want to unblock this user?',
    blocked: 'Blocked',
  },

  // Identity
  identity: {
    title: 'Anonymous Identity',
    notLoggedIn: 'Not logged in',
    loginButton: 'Identity',
    createButton: 'Create Identity',
    logoutButton: 'Logout',
    loggedInAs: 'Logged in as',
    // Menu items for identity flyout
    menu: {
      profile: 'Profile',
      friends: 'Friends',
      contentSocial: 'Content & Social',
      ciphers: 'Ciphers',
      devices: 'Devices',
    },
    // Actions for identity interactions
    actions: {
      message: 'Message',
      viewProfile: 'View Profile',
      addFriend: 'Add Friend',
      removeFriend: 'Remove Friend',
    },
    // Device management
    device: {
      newDeviceTitle: 'New Device Added',
      newDeviceMessage: 'You\'re now logged in on {{deviceName}}. Click here to manage your devices.',
    },
    // Devices page
    devices: {
      title: 'Devices',
      subtitle: 'Manage devices that have access to your identity. Each device has its own encryption keys.',
      tabs: {
        devices: 'Devices',
        activity: 'Activity',
      },
      yourDevices: 'Your Devices',
      noDevices: 'No devices found.',
      thisDevice: 'This device',
      lastActive: 'Active',
      added: 'Added',
      rename: 'Rename',
      remove: 'Remove',
      removeAllOthers: 'Remove all other devices',
    },
    // Activity tracking
    activity: {
      title: 'Activity Tracking',
      description: 'Choose how your device activity is tracked. This helps you see when each device was last used.',
      whenActive: 'When active',
      whenActiveDesc: 'Only update when you interact with the app',
      periodic: 'Periodic',
      periodicDesc: 'Update at regular intervals while the app is open',
      disabled: 'Disabled',
      disabledDesc: "Don't track activity (last active won't update)",
      updateInterval: 'Update interval',
      interval15: 'Every 15 minutes',
      interval30: 'Every 30 minutes',
      interval60: 'Every hour',
      settingUpdated: 'Activity tracking preference updated',
    },
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
      creatingTitle: 'Creating Your Identity',
      creatingSubtitle: 'Setting up encryption keys. This may take a moment...',
      success: 'Identity created successfully!',
      redirecting: 'Redirecting to login...',
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
      loggingInTitle: 'Logging In',
      redirecting: 'Opening your identity...',
      success: 'Logged in successfully!',
      errorInvalid: 'Invalid passphrase. Please try again.',
      errorLocked: 'Too many failed attempts. Please try again later.',
      errorRateLimited: 'Please wait {{seconds}} seconds before trying again.',
      attemptsRemaining: '{{remaining}} attempts remaining before lockout.',
      noIdentity: "You don't have an identity yet.",
      createPrompt: 'Create one to get started.',
      // Login status messages
      status: {
        authenticating: 'Verifying passphrase...',
        deriving_keys: 'Deriving encryption keys...',
        loading_device: 'Loading device keys...',
        decrypting_bundle: 'Decrypting signing keys...',
        complete: 'Complete!',
      },
    },
    // Unlock modal (after page refresh)
    unlock: {
      title: 'Session Locked',
      subtitle: 'Enter your passphrase to unlock your session.',
      passphrasePlaceholder: 'Enter your passphrase',
      passphraseRequired: 'Passphrase must be at least 8 characters.',
      submitButton: 'Unlock',
      success: 'Unlocked!',
      errorInvalid: 'Invalid passphrase. Please try again.',
      loginDifferent: 'Login to a different identity',
      logoutButton: 'Fully Logout',
    },
    // Delete confirmation
    delete: {
      title: 'Delete Identity',
      warning: 'This action cannot be undone. Your identity will be permanently deleted.',
      confirmButton: 'Delete Identity',
    },

    // E2E Encryption
    e2e: {
      // Key generation and initialization
      initializingKeys: 'Setting up encryption keys...',
      keyGenerationFailed: 'Failed to generate encryption keys. Please try again.',
      bundleEncryptionFailed: 'Failed to encrypt signing key bundle.',
      bundleUploadFailed: 'Failed to upload encryption keys to server.',
      deviceRegistrationFailed: 'Failed to register this device for encryption.',

      // Bundle operations
      bundleFetchFailed: 'Failed to fetch encryption keys from server.',
      bundleDecryptFailed: 'Failed to decrypt encryption keys. Check your passphrase.',
      invalidBundleData: 'Invalid encryption key data received from server.',

      // Device key storage
      deviceKeyStorageFailed: 'Failed to store device encryption keys.',
      deviceKeyLoadFailed: 'Failed to load device encryption keys.',
      deviceKeyNotFound: 'No encryption keys found for this device.',

      // Login flow
      newDeviceDetected: 'New device detected. Setting up encryption...',
      existingDeviceLoaded: 'Encryption keys loaded successfully.',
      signingKeyDecrypted: 'Signing key decrypted successfully.',

      // Separate passphrase
      separatePassphrase: {
        label: 'Use separate passphrase for encryption keys',
        hint: 'Advanced: Protect your encryption keys with a different passphrase than your identity login.',
        placeholder: 'Enter encryption passphrase',
        confirmPlaceholder: 'Confirm encryption passphrase',
        mismatch: 'Encryption passphrases do not match.',
        tooShort: 'Encryption passphrase must be at least 12 characters.',
        sameAsIdentity: 'Encryption passphrase must be different from identity passphrase.',
        required: 'Both passphrases are required to access messages on new devices.',
      },

      // Device naming
      deviceName: {
        prompt: 'Name this device',
        placeholder: 'e.g., Work Laptop, iPhone',
        hint: 'This name helps you identify devices in your account.',
        defaultDesktop: 'Desktop',
        defaultMobile: 'Mobile',
        defaultWeb: 'Web Browser',
        defaultUnknown: 'Unknown Device',
      },

      // Errors
      errors: {
        webCryptoUnavailable: 'Web Crypto API is not available. Please use a modern browser.',
        indexedDbUnavailable: 'IndexedDB is not available. Private browsing mode may not be supported.',
        kemEncryptionFailed: 'Failed to encrypt post-quantum keys.',
        kemDecryptionFailed: 'Failed to decrypt post-quantum keys. Check your passphrase.',
        invalidKeySize: 'Invalid key size. Key data may be corrupted.',
        argon2Failed: 'Key derivation failed. Please try again.',
      },
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
      alreadyOwned: 'This is already attached to another Adieuu account. You may have signed up with it previously.',
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
      subtitle: 'Customize how Adieuu looks and feels.',
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
    title: 'About Adieuu',
    subtitle: 'Secure, private messaging for everyone.',
    missionTitle: 'Our Mission',
    missionText1: "Adieuu was built with privacy at its core. We believe that private communication is a fundamental right, not a luxury. Our platform uses end-to-end encryption to ensure that your messages remain private between you and your intended recipients.",
    missionText2: "Unlike other messaging platforms, we don't sell your data, track your conversations, or serve you targeted ads. Your privacy is not our business model.",
    securityTitle: 'Security',
    securityText: 'All messages are encrypted using industry-standard cryptographic algorithms. Our passwordless authentication system eliminates the risk of password breaches while providing a seamless user experience.',
    desktopTitle: 'Desktop App',
    desktopText: 'The Adieuu desktop app is built with Electron, providing a native experience on Windows, macOS, and Linux. It shares the same secure codebase as our web application, ensuring consistent security across all platforms.',
  },

  // Home page
  home: {
    title: 'Welcome to Adieuu',
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
        description: 'Experience Adieuu as a native desktop application with system notifications and offline support.',
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
  },

  // Ciphers (Community Ciphers for Spaces)
  ciphers: {
    title: 'Ciphers',
    subtitle: 'Manage your community ciphers for encrypted Spaces.',
    addButton: 'Add Cipher',
    notLoggedIn: 'Please log in to your identity to manage ciphers.',
    sessionLocked: 'Your session is locked. Enter your passphrase to unlock and view your ciphers.',

    // Empty state
    empty: {
      title: 'No Ciphers Yet',
      description: 'Ciphers are shared encryption keys for Spaces. Add a cipher to join or create encrypted communities.',
      addFirst: 'Add Your First Cipher',
    },

    // Cipher card
    card: {
      cipherId: 'Cipher ID',
      created: 'Created',
      entropyPieces: 'Entropy Pieces',
    },

    // Add cipher modal
    addModal: {
      title: 'Add New Cipher',
      description: 'Create a cipher from one or more secret phrases. Anyone who knows the same phrases can derive the same cipher.',
      nameLabel: 'Cipher Name',
      namePlaceholder: 'e.g., My Community',
      nameHint: 'A friendly name to identify this cipher.',
      entropyLabel: 'Secret Phrases',
      entropyRowPlaceholder: 'Enter a secret phrase...',
      entropyHint: 'These phrases are combined to derive the cipher. Order matters.',
      addEntropy: 'Add another phrase',
      securityTitle: 'Security Note',
      securityWarning: 'Anyone who knows these phrases can decrypt messages encrypted with this cipher. Keep them secret and share only with trusted community members.',
      submit: 'Create Cipher',
    },

    // Delete modal
    deleteModal: {
      title: 'Delete Cipher',
      message: 'Are you sure you want to delete "{{name}}"? You will lose access to any messages encrypted with this cipher unless you re-add it with the same entropy.',
    },

    // Edit modal
    editModal: {
      title: 'Edit Cipher',
      tabs: {
        details: 'Details',
        entropy: 'Secret Phrases',
      },
      nameLabel: 'Cipher Name',
      namePlaceholder: 'e.g., My Community',
      spaceIdLabel: 'Space ID',
      spaceIdPlaceholder: 'Optional: Associated space',
      epochIdLabel: 'Epoch ID',
      epochIdPlaceholder: 'Optional: Epoch identifier',
      entropyLabel: 'Secret Phrases',
      entropyRowPlaceholder: 'Enter a secret phrase...',
      entropyHint: 'These phrases are combined to derive the cipher. Order matters.',
      addEntropy: 'Add another phrase',
      entropyWarningTitle: 'Changing Entropy Warning',
      entropyWarning: 'Modifying these phrases will change the cipher key. Any content encrypted with the previous cipher will NOT be decryptable with the new one. This is expected for epoch rotation.',
      save: 'Save Changes',
      saving: 'Saving...',
    },

    // Share modal
    shareModal: {
      title: 'Share Cipher',
      warningTitle: 'Security Warning',
      warningMessage: 'You are about to share this cipher\'s secret phrases. Anyone who receives these phrases will be able to decrypt all messages encrypted with this cipher. Only share with people you trust.',
      warningBullets: [
        'These phrases grant full access to encrypted content',
        'Cannot be revoked once shared',
        'Share only with trusted community members',
      ],
      consentLabel: 'I understand the security implications',
      continueButton: 'Continue to Share',
      qrTitle: 'Scan QR Code',
      qrDescription: 'Have the recipient scan this QR code to add the cipher.',
      copyTitle: 'Copy Phrases',
      copyDescription: 'Copy the secret phrases to share manually.',
      copyButton: 'Copy to Clipboard',
      copied: 'Copied!',
      phraseLabel: 'Phrase {{index}}',
    },

    // Duplicate modal
    duplicateModal: {
      title: 'Duplicate Cipher',
      description: 'Create a copy of this cipher with a new name. The copy will have the same entropy and will derive the same cipher key.',
      nameLabel: 'New Name',
      namePlaceholder: 'e.g., {{name}} (Copy)',
      submit: 'Create Copy',
    },

    // Messages
    messages: {
      created: 'Cipher created successfully.',
      deleted: 'Cipher deleted.',
      renamed: 'Cipher renamed.',
      updated: 'Cipher updated successfully.',
      duplicated: 'Cipher duplicated successfully.',
      copied: 'Copied to clipboard.',
    },

    // Errors
    errors: {
      noEntropy: 'Please enter at least one secret phrase.',
      createFailed: 'Failed to create cipher.',
      deleteFailed: 'Failed to delete cipher.',
      renameFailed: 'Failed to rename cipher.',
      updateFailed: 'Failed to update cipher.',
      duplicateFailed: 'Failed to duplicate cipher.',
      copyFailed: 'Failed to copy to clipboard.',
    },
  },
} as const;

export type TranslationKeys = typeof en;

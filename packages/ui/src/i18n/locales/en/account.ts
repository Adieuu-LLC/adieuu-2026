/**
 * Account (non-alias) settings and overview.
 */
export const account = {
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
      // Moderator display name
      moderatorDisplayName: 'Moderator Display Name',
      moderatorDisplayNameHint: 'Visible to other moderators in the moderation panel.',
      moderatorDisplayNamePlaceholder: 'Enter a display name...',
      moderatorDisplayNameSaved: 'Display name updated.',
      moderatorDisplayNameError: 'Failed to update display name.',
      // Desktop updates
      updates: 'Updates',
      currentVersion: 'Current Version',
      newVersionAvailable: 'New Version',
      checkForUpdates: 'Check for Updates',
      checking: 'Checking...',
      upToDate: 'You are running the latest version.',
      updateAvailable: 'A new version is available.',
      updateAvailableVersion: 'Version {{version}} is available.',
      downloadUpdate: 'Download',
      downloading: 'Downloading update...',
      updateReady: 'Update downloaded. Restart to apply.',
      updateError: 'Could not check for updates. Try again later.',
      restartToUpdate: 'Restart',
      autoDownload: 'Automatically download updates',
      autoDownloadDescription: 'When enabled, updates are downloaded in the background as soon as they are found.',
      clearInstallerCache: 'Clear local installer cache',
      clearInstallerCacheDescription:
        'Issues updating? This will remove partially downloaded or stuck update files so the next download starts fresh.',
      clearInstallerCacheButton: 'Clear cache',
      clearingInstallerCache: 'Clearing…',
      clearInstallerCacheSuccess: 'Installer cache cleared.',
      clearInstallerCacheRestartHint:
        'Restart the app before checking for updates again, especially if a download was stuck. This gives you a clean state.',
      restartAppNow: 'Restart now',
      restartHintDismiss: 'Not now',
      clearInstallerCacheError: 'Could not clear the installer cache.',
      windowsInstallLogSupport:
        'On Windows, if the update installer hangs or fails, <openLogLink>open installer.log</openLogLink> in your default app. The file is typically at %LOCALAPPDATA%\\Adieuu\\logs\\installer.log (you can also paste the logs folder path in File Explorer). You can share that file with support. If opening fails, the file may not exist until an installer has run once. New lines are appended each time the installer runs.',
      openInstallerLogError: 'Could not open the log file',
      inAppUpdateLogSupport:
        'In-app update activity (checks, download progress, cache clears, and errors) is recorded in <openLogLink>update.log</openLogLink> next to your Adieuu profile. Full path:',
      inAppUpdateLogSupportWindows:
        'The app also records electron-updater activity in a separate in-app <openLogLink>update.log</openLogLink> (in addition to the Windows installer log above). Full path:',
      openInAppUpdateLogError: 'Could not open update.log',
      // Location & regulatory context (account session)
      location: {
        title: 'Location (account)',
        subtitle:
          'Country may be visible to other users (via a flag by your name); other info you see here is used only for determining compliance requirements and localizing your support tickets.',
        maskedIp: 'Connection IP (masked)',
        jurisdiction: 'Jurisdiction',
        countryCode: 'Country',
        regionCode: 'Region / state',
        lastChecked: 'Last geo check',
        ageVerification: 'Age verification',
        unavailable: 'Location is not available yet. It is refreshed when you sign in and periodically during a session.',
      },
      ageVerification: {
        title: 'Age Verification',
        pageTitle: 'Age Verification',
        subtitle: 'Where required, your age verification status for compliance with applicable regulations.',
        statusNotRequired: 'Not required',
        statusRequired: 'Required',
        statusPending: 'Pending',
        statusVerified: 'Verified',
        statusFailed: 'Failed',
        statusExpired: 'Expired',
        statusCooldown: 'Cooldown',
        verifiedAt: 'Verified on {{date}}',
        retryAfter: 'Retry available after {{date}}',
        expirationCount: 'Expiration {{count}} of {{max}}',
        jurisdictionRequired: 'Required by your jurisdiction ({{jurisdiction}}).',
        optedIn: 'You opted in to age verification voluntarily.',
        startButton: 'Start Verification',
        resumeButton: 'Resume Verification',
        startedAt: 'Started on {{date}}',
        expiresAt: 'Expires on {{date}}',
        completedAt: 'Completed on {{date}}',
        copyUrl: 'Copy Verification Link',
        copyUrlHint: 'Paste this link in any browser to resume verification.',
        urlCopied: 'Copied to Clipboard.',
        jurisdictionLabel: 'Jurisdiction',
        legislationLabel: 'Applicable Legislation',
        optedInLabel: 'Voluntarily opted in',
        approvalMethod: 'Verified via {{method}}',
      },
      compliance: {
        title: 'Age Verification & Regulatory Info',
        subtitle:
          "Below is a summary of public age-assurance and related rules that apply to your area (based on IP). We're the only chat platform today that fully separates your private account data (email, age verification, etc) from your Aliases and activity - this allows us to fully comply with your local law, without compromising on your privacy.",
        empty: "We currently have no age verification or other regulatory requirements recorded for your jurisdiction. You may use Adieuu where our terms and your local law allow.",
      },
    },

    // Notification settings (Account)
    settings: {
      title: 'Notification Settings',
      subtitle: 'Configure system notifications, sounds, and related preferences.',
      notifications: {
        sectionTitle: 'Notifications',
        sectionDescription:
          'Control system notifications for new direct messages and reactions. In-app toasts still follow your conversation focus; native alerts only appear when this window is not focused or this tab is in the background.',
        systemToggle: 'System notifications',
        systemHint:
          'Uses your browser or operating system notification permission. Helps when Adieuu is open on another monitor or behind other apps.',
        unsupported: 'System notifications are not supported in this environment.',
        deniedBody:
          'Notifications are blocked for this site or app. Enable them in your browser or system settings to use this option.',
        permissionDeniedToast: 'Notification permission was not granted.',
        permissionResetBody:
          'Notification permission was reset. Turn this option off and on again to allow prompts, or enable notifications in your system settings.',
        enabledToast: 'System notifications enabled.',
        soundSectionTitle: 'Notification sound',
        soundSectionDescription:
          'Adjust the notification sounds used in the app! Dozens of choices are included with the app, and n the desktop app you can optionally use your own sound files! Custom sounds stay on your device and is never uploaded.',
        soundToggle: 'Notification sound',
        soundHint: 'When enabled, a sound plays according to the options below.',
        soundSelectLabel: 'Sound',
        soundPreview: 'Preview',
        soundVolumeLabel: 'Notification sound volume',
        soundVolumeHint:
          'Default notification sound, includes most messages and reactions. Values above 100% boost gain (may clip on some files or systems).',
        soundNone: 'None',
        soundCustom: 'Custom file…',
        soundCustomFile: 'Custom sound',
        soundBrowse: 'Browse…',
        soundFileMissing: 'The selected sound file could not be read. Choose another file or pick a built-in sound.',
        soundSuppressFocused: 'Suppress sound for the focused/current conversation.',
        soundSuppressFocusedHint:
          'When on, no sound plays while you are actively viewing that chat in a focused window (same as in-app toasts). Turn off to always hear a sound.',
        testNotification: 'Send test notification',
        testNotificationHint:
          'Fires a system notification and plays your selected sound so you can verify everything is working.',
        testNotificationTitle: 'Adieuu test notification',
        testNotificationBody: 'If you can see this and hear the sound, notifications are working properly.',
        testNotificationSuccess: 'Test notification sent.',
        testNotificationNoPermission: 'System notifications are not enabled or permission is missing.',

        ttlSoundSectionTitle: 'Disappearing message sound',
        ttlSoundSectionDescription:
          'Play a distinct sound when a disappearing (TTL) message arrives, so you know it needs timely attention.',
        ttlSoundSelectLabel: 'Sound',
        ttlSoundPreview: 'Preview',
        ttlSoundVolumeLabel: 'Disappearing message sound volume',
        ttlSoundVolumeHint:
          'Volume for disappearing message notifications only.',
        ttlSoundCustomFile: 'Custom sound',
        ttlSoundBrowse: 'Browse…',
        ttlSoundFileMissing: 'The selected sound file could not be read. Choose another file or pick a built-in sound.',

        mentionSoundSectionTitle: 'Mention sound',
        mentionSoundSectionDescription:
          'Play a distinct sound when someone @mentions you in a conversation.',
        mentionSoundSelectLabel: 'Sound',
        mentionSoundPreview: 'Preview',
        mentionSoundVolumeLabel: 'Mention sound volume',
        mentionSoundVolumeHint:
          'Volume for mention notifications only. ',
        mentionSoundCustomFile: 'Custom sound',
        mentionSoundBrowse: 'Browse…',
        mentionSoundFileMissing: 'The selected sound file could not be read. Choose another file or pick a built-in sound.',

        callRingtoneSectionTitle: 'Call ringtone',
        callRingtoneSectionDescription:
          'The sound that plays when you receive an incoming call.',
        callRingtoneSelectLabel: 'Ringtone',
        callRingtonePreview: 'Preview',
        callRingtoneVolumeLabel: 'Ringtone volume',
        callRingtoneVolumeHint:
          'Volume for the incoming call ringtone only.',
        callRingtoneCustomFile: 'Custom sound',
        callRingtoneBrowse: 'Browse…',
        callRingtoneFileMissing: 'The selected sound file could not be read. Choose another file or pick a built-in sound.',

        achievementSectionTitle: 'Achievement Notifications',
        achievementSectionDescription: 'Control how achievement unlocks are displayed.',
        achievementPopupToggle: 'Show achievement popup',
        achievementPopupHint: 'Display a detailed modal when you unlock an achievement. When off, a basic toast notification is shown instead.',
        achievementSoundToggle: 'Play achievement sound',
        achievementSoundHint: 'Play a sound effect when an achievement is unlocked.',
        achievementSoundSelectLabel: 'Sound',
        achievementSoundPreview: 'Preview',
        achievementSoundVolumeLabel: 'Achievement sound volume',
        achievementSoundVolumeHint:
          'Volume for achievement unlock sounds. Use the Play achievement sound toggle above to mute entirely.',
        achievementSoundCustomFile: 'Custom sound',
        achievementSoundBrowse: 'Browse…',
        achievementSoundFileMissing:
          'The selected sound file could not be read. Choose another file or pick a built-in sound.',
      },
    },

    // Appearance / Theme
    appearance: {
      title: 'Appearance',
      subtitle: 'Customise your theme, colours, and visual preferences.',
      aliasOverrideHint:
        'These settings apply per Alias, allowing you to optionally use different themes for different Aliases.',

      presetsTitle: 'Preset Themes',
      presetsDescription: 'Choose from our official and staff-picked community themes.',
      official: 'Official',
      customThemesTitle: 'Your Themes',

      editorTitle: 'Theme Editor',
      editorDescription: 'Fine-tune every colour to make the app truly yours.',
      customise: 'Customise',
      cancel: 'Cancel',
      themeName: 'Theme name',
      themeDescription: 'Description (optional)',
      saveTheme: 'Save Theme',
      deleteTheme: 'Delete',
      themeSaved: 'Theme saved.',
      themeApplied: 'Theme applied.',
      themeDeleted: 'Theme deleted.',

      messageLayoutTitle: 'Message Layout',
      messageLayoutDescription: 'Choose how messages are arranged in conversations.',
      messageLayoutLinear: 'Linear',
      messageLayoutLinearDesc: 'All messages left-aligned, like most modern messengers.',
      messageLayoutBubble: 'Bubble',
      messageLayoutBubbleDesc: 'Your messages on the right, theirs on the left.',
      messageLayoutApplied: 'Message layout updated.',

      importExportTitle: 'Import & Export',
      importExportDescription: 'Export your current theme as a file, or import a theme from someone else. Imported themes are validated and sanitised, but always be wary of random files from others..',
      exportTheme: 'Export Theme',
      importTheme: 'Import Theme',
      importSuccess: 'Theme imported and applied.',
      importFailed: 'Import failed',

      identityThemeTitle: 'Alias Theme Override',
      identityThemeDescription: 'Set a distinct theme for your alias "{{alias}}" so you can tell at a glance which alias is active.',
      identityThemeSet: 'Use current theme for this Alias',
      identityThemeActive: 'Active theme: {{name}}',
      identityThemeClear: 'Clear override',
      identityThemeCleared: 'Alias theme override removed.',

      languageTitle: 'Language',
      languageDescription: 'Choose your preferred language. More languages coming soon.',
      languageLabel: 'Display language',
      languageContributeHint: 'Want to help translate Adieuu into your language? Say hey at <mailLink>say@adieuu.com</mailLink>.',

      communityTitle: 'Community Themes',
      communitySubtitle: 'Browse themes shared by other users.',
      communityLoadError: 'Could not load community themes.',
      searchPlaceholder: 'Search themes...',
      searchButton: 'Search',
      sortNewest: 'Newest',
      sortPopular: 'Most downloaded',
      sortUpvoted: 'Most upvoted',
      downloads: 'downloads',
      upvotes: 'upvotes',
      upvoteButton: 'Upvote',
      upvoted: 'Upvoted',
      upvoteSuccess: 'Thanks for the upvote.',
      upvoteAlready: 'You have already upvoted this theme.',
      upvoteError: 'Could not upvote. Ensure you are logged into an Alias.',
      upvoteSelfError: 'You cannot upvote your own theme.',
      themeSavedToCollection: 'Theme added to your collection and applied.',
      themeSetAsIdentity: 'Theme applied as alias theme.',
      noThemes: 'No community themes found.',
      paginationInfo: 'Showing {{start}}-{{end}} of {{total}}',
      prevPage: 'Previous',
      nextPage: 'Next',
      sharePrompt: 'Share "{{name}}" with the community?',
      shareButton: 'Share Theme',
      themeShared: 'Theme shared with the community.',
      shareError: 'Could not share the theme. To share a theme, you must be logged into an Alias and it must not be a direct copy of a preset theme.',
      shareBlockedPreset: 'This theme matches a built-in preset and cannot be shared.',
      shareBlockedDuplicate: 'You have already shared a theme with these colours!',
      shareNameTooShort: 'Give the theme a name of at least 3 characters before sharing.',
      unshareButton: 'Unshare',
      unshareConfirmTitle: 'Unshare theme?',
      unshareConfirmDesc: 'This will remove "{{name}}" from the community directory, but other users who have already downloaded it will keep their copy.',
      unshareSuccess: 'Welp, it was cool while it lasted! Your theme has been removed from the community. Sad day for us all.',
      unshareError: 'Could not unshare the theme. Please try again or contact support if the issue persists.',
      authorLabel: 'by {{author}}',
      previewColors: 'Preview colours',
      previewModalTitle: 'Theme Colours -- {{name}}',
      setAccountTheme: 'Set as account theme',
      setIdentityTheme: 'Set as alias theme',
      accountThemeOverrideHint: 'An alias theme override is active; this will be applied but overridden until the override is removed.',
    },

    // Security
    security: {
      title: 'Security',
      subtitle: 'Manage your security settings and active sessions.',
      // Tabs
      tabs: {
        authentication: 'Authentication',
        passphrase: 'Alias Password',
        sessions: 'Sessions',
        dataExport: 'Data Export',
        deleteAccount: 'Delete Account',
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
      // Data Export tab
      dataExport: {
        title: 'Account Data Export',
        description: 'View and download all data associated with your account. This does not include Alias data, which is cryptographically separated from your account.',
        loading: 'Loading your account data...',
        error: 'Failed to load account data. Please try again.',
        download: 'Download as JSON',
        fileName: 'adieuu-account-data-export.json',
      },
      // Delete Account tab
      deleteAccount: {
        title: 'Delete Account',
        description: 'Permanently delete your Adieuu account.',
        warning: 'Deleting your account does NOT remove Alias data, but makes it permanently unrecoverable. If you return in the future, you will be unable to regain control of your Aliases.',
        warningRemoveContent: 'Make sure to remove all Alias content you want removed before deleting your account.',
        deleteButton: 'Delete My Account',
        confirmTitle: 'Delete your account?',
        confirmDescription: 'This is a permanent and irreversible decision. We can\'t undo this for you.',
        confirmSendCode: 'We\'ll send a verification code to your email to confirm.',
        confirmButton: 'Send Verification Code',
        otpTitle: 'Enter verification code',
        otpDescription: 'We sent a 6-digit code to your email. Enter it below to continue.',
        otpResend: 'Resend code',
        otpResendCooldown: 'Resend in {{seconds}}s',
        finalTitle: 'Last check',
        finalDescription: 'Code entered. Last check \u2014 we do NOT offer support for deleted accounts. We do not currently allow a signed up email to sign back up: you may never be able to create a new Adieuu account with that email.',
        finalButton: 'Permanently Delete Account',
        deleting: 'Deleting account...',
        error: 'Failed to delete account. Please try again.',
        noEmail: 'Account deletion requires an email address. Add and verify an email in Account Overview before deleting.',
        rateLimited: 'Too many attempts. Please wait a few minutes and try again.',
        codeError: 'Invalid or expired code. Please try again.',
      },
    },

    // Subscription management
    subscription: {
      title: 'Subscription',
      subtitle: 'Choose a plan that works for you.',
      currentPlan: 'Current Plan',
      changePlan: 'Change Plan',
      manageBilling: 'Manage Subscription',
      subscribe: 'Subscribe',
      subscribeForPrice: 'Subscribe for {{price}}/year',
      buyOnce: 'Buy Once',
      buyOnceForPrice: 'Buy Once for {{price}}',
      owned: 'Owned',
      lifetime: 'Lifetime',
      unavailable: 'Subscriptions are temporarily unavailable. Please check back later.',

      // Tab labels
      tabs: {
        manage: 'Manage',
        billing: 'Billing',
        lifetime: 'Lifetime',
        sponsorships: 'Sponsorships',
      },

      // Dedicated Billing tab (Stripe Customer Portal)
      billing: {
        heading: 'Billing & payments',
        stripeManaged:
          'Subscription billing is handled securely by Stripe. Open the Stripe Customer Portal to update payment methods, view invoices and receipts, and manage renewal settings for plans billed through Stripe.',
        giftedBody:
          'Your access was gifted; there is no Stripe billing profile for your account yet. If you later subscribe or add a payment method through Stripe, billing will appear here.',
        openStripe: 'Open Stripe billing portal',
        noCustomer:
          'You do not have a Stripe billing profile yet. When you subscribe to a paid plan, you will see billing information here.',
        loading: 'Loading billing details...',
        loadError: 'We could not load your billing details. Please try again.',
        renewalHeading: 'Subscription renewal',
        lifetime: 'Lifetime access',
        autoRenewOn: 'Auto-renew is on',
        autoRenewOff: 'Auto-renew is off',
        renewsOn: 'Renews on {{date}}',
        expiresOn: 'Expires on {{date}}',
        cancelsOn: 'Cancels on {{date}}',
        cancelAtPeriodEnd: 'Your subscription will not renew at the end of the current period.',
        noRenewalInfo: 'No active subscription renewal information.',
        paymentMethodHeading: 'Payment method',
        noPaymentMethod: 'No payment method on file.',
        paymentMethodCard: '{{brand}} ending in {{last4}}',
        paymentMethodExpires: 'Expires {{month}}/{{year}}',
        updatePaymentMethod: 'Update in Stripe portal',
        historyHeading: 'Billing history',
        historyEmpty: 'No invoices or promotional redemptions yet.',
        historyDate: 'Date',
        historyDescription: 'Description',
        historyAmount: 'Amount',
        historyStatus: 'Status',
        invoiceDescription: 'Invoice {{number}}',
        invoiceDescriptionFallback: 'Invoice',
        promoDescription: 'Promo code: {{shortcode}}',
        promoGrantedTier: '{{tier}} until {{date}}',
        promoGrantedEntitlements: 'Entitlements: {{entitlements}}',
        promoNoGrant: 'Promotional access applied',
        invoiceStatus: {
          draft: 'Draft',
          open: 'Open',
          paid: 'Paid',
          uncollectible: 'Uncollectible',
          void: 'Void',
        },
        historyTypePromo: 'Promo',
        historyTypeInvoice: 'Invoice',
        viewInvoice: 'View invoice',
      },

      // Manage tab
      manage: {
        currentTier: 'Your current plan',
        currentPlanLabel: 'Your current plan',
        billingPeriodAnnual: 'Annual',
        expiresInOneDay: 'Expires in 1 day',
        expiresInDays: 'Expires in {{count}} days',
        expiresAtTooltip: 'Expires {{datetime}}',
        noPlan:
          'Without a paid plan, your account stays read-only. Paying for a subscription helps us cover costs without having to rely on ads, data collection, etc. It also makes it more expensive for bots. Subscribe below to unlock posting and full features.',
        sponsorshipCta:
          "Can't afford a plan? All good! Visit the Sponsorships tab to request sponsorship from the community.",
        readOnlyPlansIntro:
          'Without a paid plan, your account stays read-only. Paying for a subscription helps us cover costs without having to rely on ads, data collection, etc. It also makes it more expensive for bots.Subscribe below to unlock posting and full features.',
        stripeBillingIntro:
          'Payments and invoices for your subscription are processed through Stripe.',
        giftedSubscription:
          'You were gifted your subscription and will not be billed for it.',
        billingPortal:
          'Use the button below to open Stripe and manage your billing details.',
        viewCards: 'Cards',
        viewComparison: 'Compare',
        lifetimeCta:
          "Don't want a subscription? Pay once and get lifetime access!",
        manualChangeLead:
          'To upgrade, downgrade, or change your subscription, email us. Changes are processed manually for now (this is temporary) while we finish self-service plan management.',
        manualChangeEmail: 'say@adieuu.com',
      },

      promo: {
        heading: 'Have a promotional code?',
        description:
          'Enter a code below to unlock subscription access or entitlements granted by Adieuu or a partner.',
        inputLabel: 'Promotional code',
        inputPlaceholder: 'Enter your code',
        submit: 'Redeem code',
        success: 'Your promotional code was applied successfully.',
        unpaidPrompt: 'Or, have a promotional code? Enter it below.',
        toolbarCta: 'Promo code',
        errors: {
          generic: 'We could not redeem that code. Please try again.',
          invalid: 'Enter a valid promotional code.',
          invalidCode: 'That promotional code is not valid or cannot be redeemed.',
          notFound: 'That promotional code was not found.',
          expired: 'That promotional code is not currently valid.',
          jurisdiction: 'That promotional code is not available in your region.',
          maxUses: 'That promotional code has reached its maximum number of uses.',
          alreadyRedeemed: 'You have already redeemed this promotional code.',
          missingRequired: 'You must redeem other required promotional codes first.',
          incompatible:
            'This promotional code cannot be combined with one you have already redeemed.',
          rateLimited: 'Too many attempts. Please wait and try again later.',
          audience: 'This code is not available for your current subscription status.',
        },
      },

      // Identity/alias banner
      identityBanner: 'Because of our separation of accounts & aliases (for your privacy), we are unable to pull billing information while signed into an alias. To manage your subscription and billing details, logout of your alias and sign in to your account.',

      // Section headings
      sections: {
        annual: 'Compare Plans',
        lifetime: 'Lifetime Access',
        lifetimeDescription: 'One-time purchase. Insider access forever, plus exclusive entitlements.',
      },

      // Tier names and descriptions
      tiers: {
        unpaid: {
          name: 'Public Read-Only',
          description: 'Read-only until you subscribe. You can browse public spaces, but posting and paid features stay locked.',
        },
        access: {
          name: 'Access',
          description: 'Priority support and early access to new features.',
        },
        insider: {
          name: 'Insider',
          description: 'Everything in Access, plus larger uploads and extended media.',
        },
        vanguard: {
          name: 'Vanguard',
          description: 'Lifetime Insider access for early supporters of the platform.',
        },
        founder: {
          name: 'Founder',
          description: 'The highest tier of lifetime Insider access, for founding supporters.',
        },
      },

      // Entitlement labels
      entitlements: {
        vanguard: 'Vanguard Member',
        founder: 'Founding Member',
        vanguardCelebrate: 'Thank you for backing Adieuu early! Your support enables us to build faster and deliver more for everyone!',
        founderCelebrate: 'Thank you for backing Adieuu early! Your support enables us to build faster and deliver more for everyone!',
      },

      // Feature comparison
      features: {
        readOnly: 'Read Only (Unable to Post)',
        aliases: 'Aliases: Anonymous handles you post or act as, cryptographically separated from your account. Included per subscription:',
        encryption: 'E2EE: End to end encryption on all private content',
        forwardSecrecy: 'E2EE: Forward Secrecy (optional)',
        liveMedia: 'E2EE: Live voice, video, screensharing',
        streamQuality: 'Live Stream Quality (Camera / Screenshare)',
        uploadSize: 'Upload File Size (Images, Voice, Video, Files)',
        emojiLimit: 'Custom Emoji Limit',
        ttlMessages: 'Disappearing (time-based) messages',
        themes: 'Themes: Customize your app, share & download themes from the community with one click!',
        federation: 'Federation (soon): Pipe your public posts to external repositories via ActivityPub, custom Webhooks, & more.',
        mfa: 'MFA: Apps, Passkeys, and hardware keys supported at account level',
        supportDev: 'Support Adieuu\'s development: more servers, more features, and ... more!',
        privateSpace: 'Private Space with Adieuu team',
        moderationOptOut: 'Media content moderation opt-out',
        featureEa: 'Early Access to New Features',
        featureVote: 'Vote on new features & roadmap priority',
        callMonthly: 'Access to a monthly Roadmap & Q/A call with Adieuu Team',
        badgeInsider: 'Exclusive Insider badge (toggleable)',
        badgeVanguard: 'Exclusive Vanguard badge (toggleable)',
        designAchievement: 'Design an Achievement: Work with the team to create & name a new achievement',
        whaleWall: 'Add a message of your choice, etched on a dedicated page in the Adieuu app forever.',
        badgeFounder: 'Exclusive Founder badge (toggleable)',
        callBiWeekly: 'Access to internal bi-weekly product & feature roadmap calls: we\'ll answer questions, and ask for your personal feedback on our product direction. You know before anyone else what we\'re thinking and working on next'
      },

      featureVariables: {
        aliases: {
          access: 1,
          insider: 2,
          vanguard: 3,
          founder: 3,
        },
        streamQuality: {
          access: '540p / 720p',
          insider: '720p / 1080p',
          vanguard: '720p / 1080p',
          founder: '720p / 1080p',
        },
        uploadSize: {
          access: '1.337GB',
          insider: '4.20GB',
          vanguard: '4.20GB',
          founder: '9.001GB',
        },
        emojiLimit: {
          access: 10,
          insider: 25,
          vanguard: 42,
          founder: 42,
        },
      },

      comparison: {
        featureColumn: 'Feature',
        included: 'Included',
        notIncluded: 'Not included',
        billingRowLabel: 'Billing',
        cellAnnual: 'Annual subscription',
        cellLifetime: 'One-time · lifetime access',
        tierAnnual: 'Annual',
        tierLifetime: 'Lifetime',
        scrollPreviousTiers: 'Show previous plan columns',
        scrollNextTiers: 'Show more plan columns',
        scrollHint: 'Scroll sideways or drag the plan headers to compare all tiers.',
        scrollNudgeRegionLabel: 'Plan comparison scroll controls',
        /** Ordered footnotes for the comparison table; sync indices with `COMPARISON_FEATURE_FOOTNOTE_INDEX`. */
        footnotes: ['Subject to Adieuu staff final discretion and moderation', 'Includes no right to control; customer role is advisory only and subject to Adieuu ToS, which may include additional restrictions.'] as const,
        footnotesRegionLabel: 'Plan comparison footnotes',
        footnoteJumpTo: 'Jump to note {{n}}',
        joinNow: 'Join Now',
        joinNowRowLabel: 'Subscribe',
      },

      // Checkout modal
      checkoutModal: {
        title: 'Join {{tier}}',
        annualPrice: '{{amount}} / year',
        monthlyEquivalent: 'That\u2019s {{amount}} / month',
        lifetimePrice: '{{amount}} one-time',
        dueToday: 'Due today',
        checkoutWithStripe: 'Checkout with Stripe',
        cashTitle: 'Prefer to pay in cash (USD)? (click to expand)',
        cashBody:
          'Include cash payment and your account ID in a sealed envelope and send to the address below.',
        cashTo: 'Adieuu Accounts',
        cashAddress: 'Cash payments are temporarily disabled while we have our legal counsel cover our butts.',
        close: 'Cancel',
      },

      // Status labels
      status: {
        active: 'Active',
        trialing: 'Trial',
        pastDue: 'Past Due',
        canceled: 'Cancelled',
        unpaid: 'Unpaid',
        incomplete: 'Incomplete',
        paused: 'Paused',
      },

      // Period and cancellation
      periodEnd: 'Current period ends {{date}}',
      cancelAtPeriodEnd: 'Your subscription will cancel at the end of this period.',
      renewsOn: 'Renews on {{date}}',
      expiresOn: 'Expires on {{date}}',
      cancelsOn: 'Cancels on {{date}}',

      // Toasts
      checkoutSuccess: 'Purchase successful! Welcome aboard.',
      checkoutCancelled: 'Checkout cancelled. No changes were made.',
      errorLoading: 'Could not load subscription details.',
      errorCheckout: 'Could not start checkout. Please try again.',
      errorPortal: 'Could not open billing portal. Please try again.',

      pending: {
        message:
          'Waiting for your purchase to finish processing. You can keep using the app; this updates automatically when your plan changes.',
        cancel: 'Stop waiting',
        timeout:
          'We could not confirm your purchase yet. If you completed payment, your plan may still update shortly — check back on this page or restart the app.',
      },

      upgradeNotification: {
        title: 'Subscription Upgraded',
        sponsorship: 'You have been gifted a subscription!',
        sponsorshipWithSponsor: '{{firstName}} {{lastInitial}} gifted you a subscription!',
        promoCode: 'Your promo code has been successfully applied!',
        adminGift: "You've received a subscription upgrade!",
        purchase: 'Welcome to {{tier}}!',
        lifetime: 'Lifetime Access',
        tierLabel: 'Plan: {{tier}}',
        dismiss: 'Great!',
        dismiss1: 'Awesome!',
        dismiss2: "Let's go!",
        dismiss3: 'Nice!',
      },
    },

    referral: {
      title: 'Referrals',
      subtitle: 'Share your referral link and support others joining Adieuu.',
      yourCodes: {
        title: 'Your referral codes',
        description: 'Create up to three active codes. Stats show link visits, signups, and paid subscriptions — never who signed up.',
        empty: 'You have not created any referral codes yet.',
      },
      stats: {
        summary: '{{visits}} visits · {{signups}} signups · {{subscriptions}} subscriptions',
      },
      copyLink: 'Copy link',
      createButton: 'Create code',
      edit: 'Edit',
      delete: 'Remove',
      editTitle: 'Edit referral code',
      editDescription: 'Update your referral code or the message shown on your landing page.',
      save: 'Save changes',
      saving: 'Saving…',
      cancel: 'Cancel',
      linkCopied: 'Referral link copied.',
      createSuccess: 'Referral code created.',
      updateSuccess: 'Referral code updated.',
      deleteSuccess: 'Referral code removed.',
      create: {
        title: 'Create a code',
        description: 'Choose a custom code or leave it blank to generate one automatically.',
        codeLabel: 'Custom code (optional)',
        codePlaceholder: 'Leave blank to generate one',
        codeHint: '3–24 characters, lowercase letters, numbers, and dashes.',
        messageLabel: 'Landing page message (optional)',
        messagePlaceholder: 'Hey, thanks for clicking my link.',
        submit: 'Create code',
        submitting: 'Creating…',
      },
      redeem: {
        title: 'Enter a referral code',
        description: 'Credit another member if they referred you. You can only do this once per account.',
        codeLabel: 'Referral code',
        submit: 'Apply referral',
        submitting: 'Applying…',
        success: 'Referral applied. Thank you for supporting another member!',
        alreadyApplied: 'You have already applied a referral code to this account.',
        alreadyAppliedWithCode: 'You were referred with code {{code}}.',
        errors: {
          generic: 'That referral code could not be applied.',
        },
      },
      errors: {
        loadFailed: 'Could not load referral details.',
        createFailed: 'Could not create referral code.',
        updateFailed: 'Could not update referral code.',
        deleteFailed: 'Could not remove referral code.',
        copyFailed: 'Could not copy link.',
      },
      landing: {
        title: 'You were invited',
        subtitleValid: 'Someone shared Adieuu with you.',
        subtitleInvalid: 'This referral link is no longer valid.',
        invalid: 'This referral link is no longer valid.',
        customMessageLabel: 'The person inviting you included this message:',
        accept: 'Accept referral and sign up',
        decline: 'Continue without referral',
        continueWithout: 'Continue to sign in',
        privacyNote: {
          optional: 'Referral acceptance is optional and does not reveal your identity to the referrer.',
          later: 'You may give this person (or someone else) credit after signing up via your account settings.',
          credit: 'If you subscribe to Adieuu, this person will get a credit for a month of Access.',
        },
        backHome: 'Back to home',
      },
    },

    checkout: {
      complete: {
        titleSuccess: 'Purchase complete',
        bodySuccess:
          'Thank you. Return to the Adieuu desktop app to continue — your plan updates there automatically after payment finishes processing.',
        titleCancelled: 'Checkout cancelled',
        bodyCancelled: 'No payment was completed. You can close this tab and return to the app whenever you like.',
        titleUnknown: 'Checkout finished',
        bodyUnknown:
          'You can close this tab and return to the Adieuu desktop app. If you completed a purchase, your plan will update there shortly.',
        openApp: 'Open Adieuu',
        confirming: 'Confirming your subscription...',
        devHint:
          'Development desktop builds use this link instead: {{devLink}}',
      },
    },
} as const;

/**
 * Marketing and landing content: About, Download, Home, guided tour copy.
 */
export const staticPages = {
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
    updates: {
      title: 'Check for Updates',
      subtitle: 'Keep Adieuu up to date with the latest features and security patches.',
      webAvailableTitle: 'A new web version is available',
      webAvailableHint: 'Refresh this page to load the latest assets and fixes.',
      webRefreshButton: 'Refresh to update',
    },
  },

  download: {
    title: 'Download the desktop app',
    subtitle:
      'Use Adieuu as a native app on Windows, macOS, or Linux. Same privacy and encryption as the browser, with a better fit for daily use.',
    benefitsTitle: 'Why use the desktop app',
    benefitNotifications:
      'Notifications can work even when the app is not in the foreground, so you are less likely to miss messages.',
    benefitSounds:
      'Choose your own notification sound and use custom audio files from your device.',
    benefitNative:
      'Native integration with your operating system: dock or taskbar presence, window management, and a familiar desktop workflow.',
    benefitReliableAudio:
      'Sound playback is less subject to browser autoplay rules, so notifications are more reliable.',
    benefitKeyStorage:
      'Cryptographic keys can be stored in your OS keychain (e.g. Windows Credential Manager, macOS Keychain), not only in browser storage.',
    benefitDedicatedWindow:
      'A dedicated window keeps Adieuu separate from dozens of browser tabs.',
    limitationsTitle: 'Browser limitations',
    limitationTab:
      'In the browser, real-time alerts and sounds generally work only while the tab is open. Closing the tab stops the connection.',
    limitationAutoplay:
      'Browsers may block or delay sounds until you have interacted with the page, which can make notification sounds feel inconsistent.',
    limitationIndexedDb:
      'Browser storage can be cleared when you clear site data or cache, which can affect local keys.',
    limitationNoTray:
      'There is no system tray or dock icon in the browser; the desktop app can sit in the tray for quick access.',
    linksTitle: 'Downloads',
    linksLoading: 'Loading available downloads...',
    linksError: 'Could not load downloads. Please try again later.',
    linksRetry: 'Retry',
    linksNone: 'No downloads are available yet.',
    versionLabel: 'Latest release: v{{version}}',
    releaseDate: 'Released {{date}}',
    recommendedForYou: 'Recommended for your system',
    osWindows: 'Windows',
    osMac: 'macOS',
    osLinux: 'Linux',
    formatNsis: 'Installer (.exe)',
    formatDmg: 'Disk Image (.dmg)',
    formatZip: 'Archive (.zip)',
    formatAppImage: 'AppImage',
    formatDeb: 'Debian (.deb)',
    formatRpm: 'RPM (.rpm)',
    viewOnGitHub: 'View on GitHub',
    viewSboms: 'Software Bill of Materials (SBOM)',
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
    onboarding: {
      title: 'Get started',
      subtitle:
        'Adieuu has two sign-ins: your account (where your personal info lives, like email or phone) and your Alias (your public identity you use for chatting and other activities). Complete the steps below to secure your account and start messaging.',
      loading: 'Loading your progress...',
      badgeComingSoon: 'Coming soon',
      items: {
        tour: {
          title: 'Take the tour',
          description: 'See where search, your Alias, account settings, and more live in the app.',
          action: 'Start tour',
          actionRetake: 'Retake tour',
        },
        mfa: {
          title: 'Add multi-factor authentication (MFA)',
          description: 'Protect your account with an authenticator app or passkey.',
          action: 'Go to security',
        },
        verify: {
          title: 'Verify your email or phone',
          description: 'Confirm your contact method so we can reach you if needed.',
          action: 'Account overview',
        },
        alias: {
          title: 'Create your first Alias',
          description: 'Your Alias is how others find you. It is separate from your account login for privacy.',
          action: 'Alias settings',
        },
        appearance: {
          title: 'Personalise your appearance',
          description: 'Choose a preset theme, customise colours, or explore community themes.',
          action: 'Start tour',
          actionRetake: 'Retake tour',
        },
        age: {
          title: 'Verify your age',
          description: 'Age verification will be available here soon.',
        },
      },
    },
  },

  // Guided tour (product walkthrough)
  tour: {
    steps: {
      welcome: {
        title: 'Welcome to Adieuu{{platform}}!',
        descriptionWeb:
          'You sign in to your Adieuu account first (email or phone). Then you open your Alias to use messaging and social features. Your Alias is separate from your account login for privacy. Let us show you around.',
        descriptionDesktop:
          'You sign in to your Adieuu account first (email or phone). Then you open your Alias to use messaging and social features. Your Alias is separate from your account login for privacy. Let us show you around.',
        descriptionMobile:
          'You sign in to your Adieuu account first (email or phone). Then you open your Alias to use messaging and social features. Your Alias is separate from your account login for privacy. Let us show you around.',
      },
      search: {
        title: 'Search',
        description:
          'Search for people by display name or username. Pick a result to open their profile, or press Enter to see all matches on the search page.',
      },
      sidebarTabs: {
        title: 'Friends and conversations',
        description:
          'Switch between Friends, Conversations, and Spaces. Your friends list and direct messages live here.',
      },
      identity: {
        title: 'Your Alias',
        description:
          'Use this control to log in to your Alias, switch Aliases, or manage Alias settings. Messaging and social features use your Alias, not your account email or phone.',
      },
      account: {
        title: 'Account',
        description:
          'Manage your profile, security (including MFA), notification settings, and sign out of your account here.',
      },
      logout: {
        title: 'Sign out',
        description:
          'When you are done, sign out of your account from this menu. Your session ends securely.',
      },
    },
    appearance: {
      welcome: {
        title: 'Personalise Adieuu',
        description: 'Let us show you how to customise the look and feel of Adieuu to match your style.',
      },
      nav: {
        title: 'Finding Appearance',
        description: 'Open your account menu and select Appearance to access theme settings.',
      },
      presets: {
        title: 'Preset themes',
        description: 'Choose from several built-in themes. Click one to apply it instantly.',
      },
      editor: {
        title: 'Customise colours',
        description: 'Open the theme editor to tweak individual colours with the colour picker. You can fine-tune backgrounds, text, accents, and more.',
      },
      communityLink: {
        title: 'Community marketplace',
        description: 'Head to the Community Themes page to browse themes shared by other users.',
      },
      communitySearch: {
        title: 'Search themes',
        description: 'Use the search bar to find community themes by name, description, or tag. Results update as you type.',
      },
      btnPreview: {
        title: 'Preview colours',
        description: 'Click the eye icon to open a full preview of every colour in this theme before committing to it.',
      },
      btnIdentity: {
        title: 'Set as Alias theme',
        description: 'This icon applies the theme only to your current Alias session, giving each Alias its own look. You can further customise per-Alias themes from the Appearance page under your Identity settings.',
      },
      btnIdentityHint: {
        title: 'Per-Alias themes',
        description: 'If you are signed in to one of your Aliases, you will also see an icon here to apply a theme only to that Alias. This is great for creating visual separation when you own multiple Aliases. You can also manage per-Alias themes from the Appearance page under your Identity settings.',
      },
      btnAccount: {
        title: 'Set as Account theme',
        description: 'Apply this theme as your account-wide default. If an Alias override is active, a tooltip will remind you.',
      },
      btnUpvote: {
        title: 'Upvote',
        description: 'Like a theme? Give it an upvote so others can find it more easily. You cannot upvote your own themes.',
      },
    },
    resumeToast: {
      title: 'Tour paused',
      description: 'You closed the tour early. Pick up where you left off whenever you are ready.',
      action: 'Resume tour',
    },
  },
} as const;

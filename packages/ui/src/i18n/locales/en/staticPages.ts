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
    roadmap: {
      title: 'Roadmap',
      subtitle: 'What we have shipped, what we are building, and what is coming next.',
      today: 'Today',
      latestRelease: 'Latest Release',
      communityIdea: 'Community Idea',
      navigateUp: 'Jump to Previous Release',
      navigateDown: 'Jump to Next Release',
      jumpToLatest: 'Jump to Latest Release',
      teamRoadmap: 'Team roadmap',
      suggestedBy: 'Suggested by',
      dateLabel: '{{date}}',
      undatedReleased: 'Released (date unknown)',
      undatedBand: '{{status}} (no target date)',
      commentCount: '{{count}} comments and feedback',
      commentCount_one: '1 comment and feedback',
      commentCount_other: '{{count}} comments and feedback',
      seeMore: 'See More',
      readMore: 'Read more',
      showLess: 'Show less',
      footerTitle: 'And much, much more!',
      footerText:
        'Have something you would like to see us add? Submit your own feature idea and see if others agree! We use community upvotes on Features to help determine what to prioritize next. Your idea could be the next big thing we work on!',
      footerCta: 'Vote on Features',
      loadError: 'Could not load the roadmap timeline.',
      empty: 'Nothing on the roadmap yet. Check back soon!',
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
    subtitleIdentity: 'Welcome back. Here is an overview of your activity.',
    loading: 'Loading your progress...',
    badgeComingSoon: 'Coming soon',

    public: {
      subtitle: 'Private, encrypted messaging built for everyone.',
      tabs: {
        about: 'What is Adieuu?',
        learn: 'Learn',
      },
      whatIsTitle: 'Private messaging, reimagined',
      whatIsText1:
        'Adieuu is a secure messaging platform that puts your privacy first. Every message is end-to-end encrypted using proven, audited cryptographic algorithms -- no one can read your conversations, not even us.',
      whatIsText2:
        'Unlike other platforms, we do not sell your data, track your conversations, or serve targeted ads. Your privacy is not our business model.',
      securityTitle: 'Security by design',
      securityText:
        'Passwordless authentication eliminates credential-stuffing attacks. Alias identities are cryptographically unlinkable to your account, so your real-world identity stays private. All data at rest is encrypted, and all traffic uses TLS.',
      ctaTitle: 'Ready to get started?',
      ctaText: 'Create an account in seconds -- all you need is an email or phone number.',
      ctaAction: 'Create account',
    },

    tabs: {
      welcome: 'Welcome',
      learn: 'Learn',
    },

    // Account-mode action steps
    account: {
      sectionPrimary: 'Get started',
      sectionPrimarySubtitle:
        'Complete these steps to set up your account and create your first Alias.',
      sectionSecondary: 'Recommendations',
      steps: {
        subscribe: {
          title: 'Choose a plan',
          description: 'An active subscription unlocks messaging, and social features.',
          action: 'View plans',
          promoAction: 'Have a promo code?',
        },
        verifyAge: {
          title: 'Verify your age',
          description: 'Your jurisdiction requires age verification.',
          descriptionJurisdiction:
            "Required by your jurisdiction ({{jurisdiction}}). We're the only platform that fully detaches your account (and age data) from your Alias and activity - the verification satisfies legal requirements, while our Alias system maintains your privacy.",
          disclosureTitle: 'What your jurisdiction requires',
          verificationExplainerTitle: 'How verifications work',
          aliasPrivacy: 'Verifications are attached to your "Account", while your messages, posts, and other activity are attached to your "Alias". Noone (not even us) can link an Alias to an Account without knowing your password.',
          aliasPrivacy2: "Plus, we specifically chose VerifyMy as our verification partner because they only ever tell us if you complete verification, and if you're over 18 (yes or no): we can't access any of the info you give them to verify. We can't even see your age! All we see is 'Yes, this person is (or isn't) over 18'.",
          aliasPrivacy3: "All of these were intentional choices when we built Adieuu: we're able to preserve your privacy, while other platforms still attach your activity to your email, phone, or ID. There's another benefit here, too - age verification and subscription make it harder (and expensive) for bots and dupe accounts: this means Adieuu has less noise, and more real humans.",
          subscribeFirstTooltip: 'Choose a plan before starting age verification',
          action: 'Start verification',
        },
        createAlias: {
          title: 'Create your first Alias',
          description: 'Your Alias is how others find you. It is separate from your account login for privacy.',
          action: 'Create Alias',
          subscribeFirstTooltip: 'Choose a plan before creating an Alias',
          verifyAgeFirstTooltip: 'Verify your age before creating an Alias',
        },
        sendFirstMessage: {
          title: 'Send your First Message',
          description: "You're ready to go! Add a friend, find a Space, and say Adieuu!",
          action: 'Log in to Alias',
          createAliasFirstTooltip: 'Create an Alias before you can start messaging',
        },
      },
      secondary: {
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
        appearance: {
          title: 'Personalise your appearance',
          description: 'Choose a preset theme, customise colours, or explore community themes.',
          action: 'Start tour',
          actionRetake: 'Retake tour',
        },
      },
      allComplete: {
        title: 'You are all set',
        subtitle:
          'You have finished the setup checklist. Log in to your Alias to chat, or jump to account settings below.',
        aliasLogin: 'Log in to your Alias',
        aliasLoginHint: 'Open your Alias profile to switch into Alias mode and start messaging.',
        accountOverview: 'Manage your account',
        security: 'Manage security',
        subscription: 'Manage your subscription',
      },
    },

    // Identity-mode action steps
    identity: {
      sectionStats: 'Your activity',
      sectionPrimary: 'Things to try',
      sectionSecondary: 'Customise',
      stats: {
        conversations: 'Conversations',
        friends: 'Friends',
        messages: 'Messages',
        achievements: 'Achievements',
      },
      steps: {
        addFriend: {
          title: 'Add a friend',
          description: 'Search for people by display name or username and send a friend request.',
          action: 'Find friends',
        },
        startConversation: {
          title: 'Start a conversation',
          description: 'Send an encrypted message to a friend or start a group chat.',
          action: 'New conversation',
        },
        joinSpace: {
          title: 'Join a Space',
          description: 'Spaces are shared communities for groups of people with common interests.',
        },
      },
      secondary: {
        appearance: {
          title: 'Change your appearance',
          description: 'Choose a theme, customise colours, or browse the community marketplace.',
          action: 'Appearance settings',
        },
        editProfile: {
          title: 'Edit your profile',
          description: 'Update your display name, bio, avatar, and other profile details.',
          action: 'Edit profile',
        },
        tour: {
          title: 'Take the tour',
          description: 'A guided walkthrough of messaging, friends, settings, and more.',
          action: 'Start tour',
          actionRetake: 'Retake tour',
        },
      },
    },

    // Learn tab (shared across modes)
    learn: {
      title: 'Learn about Adieuu',
      goBack: 'Go Back',
      navLabel: 'Learn',
      copyLink: 'Copy link to section',
      linkCopied: 'Link copied to clipboard',
      permalinkLabel: 'Permalink to this section',
      search: {
        placeholder: 'Search all topics…',
        label: 'Search Learn topics',
        noResults: 'No matching topics found.',
        resultsLabel: 'Search results',
        resultMeta: '{{tab}} · {{category}}',
      },
      tabs: {
        about: {
          label: 'About Adieuu',
          categories: {
            overview: {
              label: 'Overview',
              sections: {
                whatIsAdieuu: {
                  title: 'What is Adieuu?',
                  content:
                    'Adieuu is a secure messaging platform that puts your privacy first. Every message is end-to-end encrypted using proven, audited cryptographic algorithms -- no one can read your conversations, not even us. Unlike other platforms, we do not sell your data, track your conversations, or serve targeted ads. Your privacy is not our business model.',
                },
                mission: {
                  title: 'Our mission',
                  content:
                    'Adieuu was built with privacy at its core. We believe that private communication is a fundamental right, not a luxury. Our platform uses end-to-end encryption to ensure that your messages remain private between you and your intended recipients.',
                },
                privacyStance: {
                  title: 'Privacy is not our business model',
                  content:
                    'Unlike other messaging platforms, we do not sell your data, track your conversations, or serve you targeted ads. Your privacy is not our business model -- we fund the service through subscriptions, not surveillance.',
                },
              },
            },
            platform: {
              label: 'Platform',
              sections: {
                securityByDesign: {
                  title: 'Security by design',
                  content:
                    'Passwordless authentication eliminates credential-stuffing attacks. Alias identities are cryptographically unlinkable to your account, so your real-world identity stays private. All data at rest is encrypted, and all traffic uses TLS.',
                },
                encryptionAndAuth: {
                  title: 'Encryption and authentication',
                  content:
                    'All messages are encrypted using industry-standard cryptographic algorithms. Our passwordless authentication system eliminates the risk of password breaches while providing a seamless user experience.',
                },
                desktopApp: {
                  title: 'Desktop app',
                  content:
                    'The Adieuu desktop app is built with Electron, providing a native experience on Windows, macOS, and Linux. It shares the same secure codebase as our web application, ensuring consistent security across all platforms.',
                },
              },
            },
            gettingStarted: {
              label: 'Getting started',
              sections: {
                accountAndAlias: {
                  title: 'Account vs Alias',
                  content:
                    'Adieuu has two sign-ins: your account (where your personal info lives, like email or phone) and your Alias (your public identity you use for chatting and other activities). Your Alias is separate from your account login for privacy.',
                },
                createAlias: {
                  title: 'Create your first Alias',
                  content:
                    'Your Alias is how others find you. It is separate from your account login for privacy. An active subscription unlocks Alias creation, messaging, and social features.',
                },
                readyToStart: {
                  title: 'Ready to get started?',
                  content:
                    'Create an account in seconds -- all you need is an email or phone number. Once your account is set up, you can create an Alias and start messaging securely.',
                },
              },
            },
          },
        },
        privacy: {
          label: 'Privacy & Security',
          categories: {
        privacyBasics: {
          label: 'Privacy (Basics)',
          sections: {
            aliasPrivacy: {
              title: 'How Aliases protect your privacy',
              content:
                'Adieuu separates your account (email or phone) from your Alias (your public identity). Your Alias is cryptographically unlinkable to your account, so no one -- not even Adieuu -- can connect the two. This means your real-world identity stays private while you communicate freely.',
            },
            ageVerification: {
              title: 'Age verification without compromising identity',
              content:
                'Where required by law, Adieuu verifies your age through a third-party provider. The verification result is stored on your account, not your Alias, and is never shared with the people you talk to. Your ID documents are processed by the verification provider and are not stored by Adieuu.',
            },
            dataCollection: {
              title: 'What data Adieuu collects (and what it does not)',
              content:
                'Adieuu collects only the minimum data required to operate the service: an email or phone number for account authentication, and the encrypted messages you send. We do not read your messages, build advertising profiles, or sell any of your data. Usage analytics, when collected, are aggregated and anonymous.',
            },
          },
        },
        privacyAdvanced: {
          label: 'Privacy (Advanced)',
          sections: {
            metadataProtection: {
              title: 'Metadata protection and traffic analysis resistance',
              content:
                'Message content is only part of the picture -- who talks to whom and when can be just as revealing. Adieuu minimises metadata exposure by keeping contact graphs encrypted and avoiding long-lived identifiers in network traffic. We are actively researching additional techniques such as sealed sender and padding to further resist traffic analysis.',
            },
            unlinkability: {
              title: 'Cryptographic unlinkability between Accounts and Aliases',
              content:
                'The separation between your Account and your Alias is enforced cryptographically, not just by policy. Alias credentials are derived through a one-way process that prevents correlation, even by Adieuu infrastructure. This means a database breach cannot link your Alias activity back to your account email or phone number.',
            },
          },
        },
        securityBasics: {
          label: 'Security (Basics)',
          sections: {
            encryption: {
              title: 'End-to-end encryption',
              content:
                'Every message is encrypted on your device before it leaves. Only you and your intended recipients hold the keys to decrypt it. Adieuu uses proven, well-audited cryptographic algorithms so that no intermediary -- including Adieuu servers -- can read your conversations.',
            },
            securityModel: {
              title: 'Platform security model',
              content:
                'Adieuu is built on a zero-trust architecture. Session tokens are short-lived and scoped. Passwordless authentication eliminates credential-stuffing attacks. Multi-factor authentication adds a second layer of protection. All data at rest is encrypted, and all traffic uses TLS. We do not sell data, serve ads, or track your conversations.',
            },
          },
        },
        securityAdvanced: {
          label: 'Security (Advanced)',
          sections: {
            postQuantum: {
              title: 'Post-quantum cryptography',
              content:
                'Future quantum computers may be able to break today\'s public-key cryptography. Adieuu uses a hybrid approach that combines classical algorithms with post-quantum key encapsulation (ML-KEM). This means your messages are protected against both current attacks and future quantum threats, without sacrificing compatibility or performance.',
            },
            keyManagement: {
              title: 'Key management and device trust',
              content:
                'Your encryption keys are generated and stored on your own devices, never uploaded in plaintext. When you add a new device, a secure key-transfer protocol ensures that your existing conversations remain accessible without exposing key material to the server. Revoking a device immediately removes its access to future messages.',
            },
          },
        },
        accountsAndAliases: {
          label: 'Accounts and Aliases',
          sections: {
            whySeparation: {
              title: 'Why Adieuu separates Accounts from Aliases',
              content:
                'Your Account is your administrative identity -- it holds your email or phone, billing, and security settings. Your Alias is your social identity -- it is what other people see. By keeping these separate, Adieuu ensures that sharing your public profile never reveals the personal details behind your account.',
            },
            switchingAliases: {
              title: 'Switching between Aliases',
              content:
                'You can create multiple Aliases under one Account, each with its own display name, avatar, and theme. Switching between them is instant and does not require signing out. Other users cannot tell that two Aliases belong to the same Account.',
            },
            lostAccess: {
              title: 'What happens if you lose access',
              content:
                'If you lose access to your account email or phone, Adieuu provides a recovery flow that verifies your identity through a secondary method or recovery codes. Because encryption keys live on your devices, maintaining at least one trusted device is the most reliable way to preserve access to your message history.',
            },
          },
        },
        subscriptions: {
          label: 'Subscriptions',
          sections: {
            plans: {
              title: 'Available plans',
              content:
                'Adieuu offers a free tier with core messaging and encryption, plus paid plans that unlock additional features such as multiple Aliases, extended message history, and priority support. All plans include the same strong encryption and privacy guarantees.',
            },
            whatUnlocked: {
              title: 'What a subscription unlocks',
              content:
                'A paid subscription lets you create Aliases, participate in Spaces, and access social features like friend requests and group conversations. It also supports the ongoing development of Adieuu so we never need to rely on advertising or data sales.',
            },
            billing: {
              title: 'Billing and cancellation',
              content:
                'Subscriptions are billed monthly or annually through your chosen payment method. You can cancel at any time from your Account settings, and your paid features remain active until the end of the current billing period. Adieuu does not charge cancellation fees.',
            },
          },
        },
          },
        },
        idVerification: {
          label: 'ID Verification',
          categories: {
            whyRequired: {
              label: 'Why verification is required',
              sections: {
                jurisdiction: {
                  title: 'When your jurisdiction requires verification',
                  content:
                    'Your jurisdiction may require age verification before you can create or access Aliases. Adieuu enforces these requirements based on your location and applicable legislation.',
                },
                subscriptionGate: {
                  title: 'Verification and subscriptions',
                  content:
                    'An active subscription (Access or Insider) is required to create or log into an Alias. Age verification is a separate compliance step that may be required in addition to an active plan.',
                },
                geofencing: {
                  title: 'Regional availability',
                  content:
                    'Due to local legislation, Adieuu may not be available in some jurisdictions. When a region is blocked, the service cannot be accessed regardless of verification status.',
                },
              },
            },
            jurisdictions: {
              label: 'Jurisdictions requiring verification',
              sections: {
                catalog: {
                  title: 'Where verification is required',
                  content:
                    'The jurisdictions below require some form of age or identity verification under applicable legislation. This reference is for transparency and is not legal advice. Requirements and compatible methods reflect what Adieuu tracks for enforcement.',
                  variant: 'jurisdictionCatalog',
                },
              },
            },
            howItWorks: {
              label: 'How verification works',
              sections: {
                providerFlow: {
                  title: 'Third-party verification provider',
                  content:
                    'Adieuu verifies your age through a third-party provider. When you start verification, a secure session opens where you complete the provider\'s checks. Adieuu receives only the pass/fail result, not your ID documents.',
                },
                sessionStates: {
                  title: 'During verification',
                  content:
                    'After starting, complete the verification in the opened window. Adieuu checks status periodically while processing. If your session expires before completion, you may retry after the cooldown period.',
                },
                outcomes: {
                  title: 'Outcomes and retries',
                  content:
                    'If verification succeeds, you may proceed to create or log into an Alias. If verification fails due to local legislation, access cannot be granted until you retry after the cooldown period. Expired sessions can also be retried once the cooldown ends.',
                },
              },
            },
            privacyAndChoice: {
              label: 'Privacy and choice',
              sections: {
                dataHandling: {
                  title: 'Age verification without compromising identity',
                  content:
                    'Where required by law, Adieuu verifies your age through a third-party provider. The verification result is stored on your account, not your Alias, and is never shared with the people you talk to. Your ID documents are processed by the verification provider and are not stored by Adieuu.',
                },
                voluntaryOptIn: {
                  title: 'Voluntary verification',
                  content:
                    'If we cannot determine your jurisdiction, you are responsible for adhering to local age verification laws. You may opt in to verification voluntarily by choosing the jurisdiction whose rules should apply.',
                },
                unresolvedJurisdiction: {
                  title: 'When jurisdiction is unknown',
                  content:
                    'When your jurisdiction cannot be determined automatically, Adieuu shows an advisory rather than blocking access outright. You may choose to verify voluntarily, or proceed while ensuring you comply with local laws yourself.',
                },
              },
            },
          },
        },
      },
    },

    // Legacy keys kept for backward compat during migration
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

/**
 * Shared UI chrome: common strings, navigation, friends, notifications, etc.
 */
export const core = {
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
    getDesktopApp: 'Get desktop app',
    loginPrompt: 'Log in or create account',
    backToHome: 'Back to Home',
    account: 'Account',
    logout: 'Logout',
    expandSidebar: 'Expand sidebar',
    collapseSidebar: 'Collapse sidebar',
    friends: 'Friends',
    friendRequests: '{{count}} Friend Request(s)',
    friendRequests_one: '1 Friend Request',
    friendRequests_other: '{{count}} Friend Requests',
    chatInvitations: '{{count}} Chat Invitation(s)',
    chatInvitations_one: '1 Chat Invitation',
    chatInvitations_other: '{{count}} Chat Invitations',
  },

  // Sidebar sections
  sidebar: {
    main: 'Main',
    account: 'Account',
    identity: 'Alias',
    comingSoon: '{{feature}} coming soon.',
    tabs: {
      spaces: 'Spaces',
    },
    newConversation: 'Start New',
    update: {
      available: 'Update Available',
      downloading: 'Downloading Update',
      install: 'Install Update',
      refreshWeb: 'Refresh to Update',
      error: 'Update issue',
    },
  },

  // Search
  search: {
    title: 'Search',
    subtitle: 'Find people by username or display name.',
    placeholder: 'Search for people...',
    publicPlaceholder: 'Search public content...',
    noResults: 'No results found.',
    noResultsHint: 'Try a different search term or check the spelling.',
    hint: 'Enter a username or display name to search.',
    viewAll: 'View all results',
    resultsCount: '{{count}} result(s) found',
    resultsCount_one: '1 result found',
    resultsCount_other: '{{count}} results found',
    actions: {
      viewProfile: 'View Profile',
    },
  },

  // Identity hover card / profile card actions
  identityCard: {
    viewProfile: 'Profile',
    message: 'Message',
    block: 'Block',
    unblock: 'Unblock',
    report: 'Report',
    removeFriend: 'Remove Friend',
  },

  // Friends
  friends: {
    title: 'Friends',
    noFriends: 'No friends yet.',
    searchPlaceholder: 'Search friends...',
    addFriend: 'Add Friend',
    removeFriend: 'Remove Friend',
    pending: 'Pending',
    alreadyFriends: 'Friends',
    requestSent: 'Friend request sent.',
    requestAccepted: 'Friend request accepted.',
    requestIgnored: 'Friend request ignored.',
    friendRemoved: 'Friend removed.',
    incomingRequests: 'Friend Requests',
    accept: 'Accept',
    ignore: 'Ignore',
    cancel: 'Cancel Request',
    close: 'Close',
    viewProfile: 'View Profile',
    remove: 'Remove',
    friendsForDuration: 'Friends for {{duration}}',
    friendshipLengthUnknown: 'a while',
    friendshipLengthLessThanMinute: 'less than a minute',
    friendshipLengthMinutes_one: '1 minute',
    friendshipLengthMinutes_other: '{{count}} minutes',
    friendshipLengthHours_one: '1 hour',
    friendshipLengthHours_other: '{{count}} hours',
    friendshipLengthDays_one: '1 day',
    friendshipLengthDays_other: '{{count}} days',
    friendshipLengthMonths_one: '1 month',
    friendshipLengthMonths_other: '{{count}} months',
    friendshipLengthYears_one: '1 year',
    friendshipLengthYears_other: '{{count}} years',
    notifications: {
      requestReceived: 'Friend Request',
      requestReceivedBody: '{{name}} sent you a friend request.',
      requestAccepted: 'Friend Request Accepted',
      requestAcceptedBody: '{{name}} accepted your friend request.',
    },
  },

  // Notifications
  notifications: {
    title: 'Notifications',
    subtitle: 'Your notifications and alerts.',
    noNotifications: 'No notifications.',
    markAllRead: 'Mark all as read',
    clearAll: 'Clear all',
    // Time formatting
    time: {
      justNow: 'Just now',
      minutesAgo: '{{count}}m ago',
      hoursAgo: '{{count}}h ago',
      daysAgo: '{{count}}d ago',
    },
    // Toast notifications
    toast: {
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
    userBlocked: 'User blocked',
    userUnblocked: 'User unblocked',
    blockedBanner: 'You have blocked this user. You cannot send or receive messages.',
    blockedByOtherBanner: 'This user has blocked you. You cannot send or receive messages.',
    blockUserAction: 'Block User',
  },

  // Spaces
  spaces: {
    title: 'Spaces',
    subtitle: 'Discover and join public communities.',
    comingSoon: 'Spaces are on the way. Check back soon.',
  },
} as const;

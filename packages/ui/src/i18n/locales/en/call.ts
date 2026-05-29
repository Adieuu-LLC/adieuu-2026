/**
 * Live call UI strings.
 */
export const call = {
  rateLimited: "You're starting calls too quickly. Try again in {{seconds}}s.",
  jitsiUnavailable: 'Call service is temporarily unavailable. Please try again.',

  // Toolbar button
  startVoiceCall: 'Voice call',
  startVideoCall: 'Video call',
  startScreenshare: 'Share screen',
  callMenuAriaLabel: 'Call options',
  alreadyInCall: 'Already in a call',
  callsDisabled: 'Calls are disabled in this conversation',

  // Device setup modal
  deviceSetupTitle: 'Set up your devices',
  selectMicrophone: 'Microphone',
  selectCamera: 'Camera',
  noDevicesFound: 'No devices found',
  permissionDenied: 'Permission denied. Allow access in your browser settings and retry.',
  retryPermission: 'Retry',
  confirmCall: 'Start call',
  confirmJoin: 'Join call',
  cancelSetup: 'Cancel',
  screenshareNote: 'You will choose what to share after confirming.',

  // Call overlay
  ringing: 'Ringing...',
  connecting: 'Connecting...',
  active: 'In call',
  connectingMessage: 'Setting up encrypted connection...',
  minimize: 'Minimize',

  // Call controls
  muteAudio: 'Mute',
  unmuteAudio: 'Unmute',
  disableVideo: 'Turn off camera',
  enableVideo: 'Turn on camera',
  stopScreenshare: 'Stop sharing',
  startScreenshareControl: 'Share screen',
  leave: 'Leave call',
  end: 'End call for everyone',
  endForAll: 'End',

  // Incoming call banner
  incomingVideo: 'Video call',
  incomingAudio: 'Audio call',
  incomingScreenshare: 'Screen share',
  incoming: 'Call',
  accept: 'Accept',
  decline: 'Decline',

  // Session provider / errors
  alreadyInActiveCall: 'You are already in a call. Leave first to start or join another.',
  callStartFailed: 'Failed to start call.',
  callJoinFailed: 'Failed to join call.',
} as const;

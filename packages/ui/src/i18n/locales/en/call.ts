/**
 * Live call UI strings.
 */
export const call = {
  rateLimited: "You're starting calls too quickly. Try again in {{seconds}}s.",
  callServiceUnavailable: 'Call service is temporarily unavailable. Please try again.',

  // Toolbar button
  startCall: 'Start call',
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
  deviceSetupHint: 'You can enable video or screen sharing once in the call.',

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

  // Device popovers
  audioDevices: 'Audio devices',
  videoDevices: 'Video devices',
  selectSpeaker: 'Speaker',

  // Active call banner
  activeCallBanner: 'A call is in progress ({{count}} participant)',
  activeCallBanner_other: 'A call is in progress ({{count}} participants)',
  activeCallBannerEmpty: 'A call is in progress',
  joinCall: 'Join',

  // Incoming call banner
  incoming: 'Incoming call',
  accept: 'Accept',
  decline: 'Decline',

  // Call troubleshooting
  troubleshootLink: 'Call issues?',
  troubleshootTitle: 'Call Troubleshooting',
  troubleshootDescription: 'If a call appears stuck or a participant seems to still be connected after leaving, you can force-end the call for all participants. Everyone will need to start or join a new call afterward.',
  forceEndCall: 'End call for all participants',
  forceEndConfirm: 'This will disconnect all participants from the current call. This action cannot be undone.',
  forceEndSuccess: 'Call ended. You can now start a new call.',
  forceEndFailed: 'Failed to end the call. Please try again.',

  // E2EE status
  e2eeActive: 'End-to-end encrypted',
  e2eeNotSupported: 'Your browser does not support end-to-end encryption for calls.',
  e2eeFailed: 'End-to-end encryption could not be established for this call. Your call is still active but may not be fully private.',
  e2eeStatusInfoLabel: 'Encryption status details',
  e2eeStatusInfoActive: 'Audio and video are encrypted between participants. Only members of this call can decrypt the media.',
  e2eeStatusInfoFailed: 'Encryption could not be established for this call. The call is still connected, but media may not be fully private.',
  e2eeStatusInfoNotSupported: 'Your browser does not support call encryption. Media is relayed through the server without end-to-end protection.',

  // Session provider / errors
  alreadyInActiveCall: 'You are already in a call. Leave first to start or join another.',
  alreadyJoinedCall: 'You already joined this call',
  callStartFailed: 'Failed to start call.',
  callJoinFailed: 'Failed to join call.',
} as const;

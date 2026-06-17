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

  // Frame layout
  pinFrame: 'Pin frame',
  unpinFrame: 'Unpin frame',
  focusSoloFrame: 'Pin and show only this frame',
  showOtherFrames: 'Show other frames alongside this one',
  screenShareLabel: 'Screen',
  youLabel: 'You',
  mutedLabel: 'Muted',

  // Overlay chrome
  expandFullscreen: 'Expand the call to full screen',
  exitFullscreen: 'Exit full screen',
  expandFullscreenLabel: 'Expand call to full screen',
  exitFullscreenLabel: 'Exit full screen call view',
  resizeOverlay: 'Drag to resize call panel',

  // Control bar tooltips
  tooltipMicOn: 'Mute — click the arrow to change input device',
  tooltipMicOff: 'Unmute — click the arrow to change input device',
  tooltipCameraOn: 'Turn off camera — click the arrow to change camera',
  tooltipCameraOff: 'Turn on camera — click the arrow to change camera',
  tooltipScreenOn: 'Stop sharing your screen',
  tooltipScreenOff: 'Share your screen',
  tooltipLeave: 'Leave the call',

  // E2EE status
  e2eeIntro: 'Status',
  e2eeActive: 'E2E Encrypted',
  e2eeNotSupported: 'E2E Not Supported',
  e2eeFailed: 'E2E Encryption Failed',
  e2eeStatusInfoLabel: "What does this mean?",
  e2eeStatusInfoIntro: "This indicates the call's end-to-end (E2E) encryption status. Below are the available statuses. The statuses below only relate to audio/video in the call - all text and status updates in conversations are always encrypted end-to-end.",
  e2eeStatusInfoActive: "Audio and video are encrypted between participants' clients. Only members of this call can decrypt the media - even Adieuu staff (or a bad actor, if a breach occurs) are unable to to view your stream.",
  e2eeStatusInfoFailed: "This indicates full E2E encryption could not be established for this call. The call is still connected, but media may not be fully private. Anyone with server access (such as Adieuu staff, a bad actor in the event of a breach, or a self-hosted server owner) *may* be able view your stream. This status can sometimes happen legitimately, like in cases where a user's app data gets corrupted during an update, but shouldn't be common. You might try restarting the call to see if E2E can be re-established, or if the issue persists try an app reinstall or reach out to Adieuu support.",
  e2eeStatusInfoNotSupported: "One or more participants' devices or browsers do not support E2E encryption. Media is relayed through the server without end-to-end protection. Anyone with server access (such as Adieuu staff, a bad actor in the event of a breach, or a self-hosted server owner) could potentially snoop on your stream. Ensure all partipants are using the Adieuu app or a modern browser.",

  // Connection quality indicator
  connectionIndicatorLabel: 'Connection quality: {{quality}}',
  connectionQualityExcellent: 'Excellent',
  connectionQualityGood: 'Good',
  connectionQualityPoor: 'Fair',
  connectionQualityLost: 'Poor',
  connectionQualityUnknown: 'Unknown',
  connectionQualityReconnecting: 'Reconnecting',
  connectionStateConnected: 'Connected',
  connectionStateConnecting: 'Connecting',
  connectionStateReconnecting: 'Reconnecting',
  connectionStateSignalReconnecting: 'Reconnecting (signal)',
  connectionStateDisconnected: 'Disconnected',
  connectionDetailMediaQuality: 'Media quality',
  connectionDetailMediaState: 'Media connection',
  connectionDetailSignalingPing: 'Signaling ping',
  connectionDetailNetwork: 'Network',
  connectionDetailNetworkUnavailable: 'Not available',
  connectionDetailChatConnection: 'Chat connection',
  connectionDetailUnavailable: '—',
  chatConnectionConnected: 'Connected',
  chatConnectionConnecting: 'Connecting',
  chatConnectionReconnecting: 'Reconnecting',
  chatConnectionDisconnected: 'Disconnected',

  // Session provider / errors
  alreadyInActiveCall: 'You are already in a call. Leave first to start or join another.',
  alreadyJoinedCall: 'You already joined this call',
  callStartFailed: 'Failed to start call.',
  callJoinFailed: 'Failed to join call.',
} as const;

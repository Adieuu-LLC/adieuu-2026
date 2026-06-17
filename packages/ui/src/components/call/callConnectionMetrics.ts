import { ConnectionQuality, ConnectionState } from 'livekit-client';
import type { ChatConnectionState } from '@adieuu/shared';
import type { AppIconName } from '../../icons/appIcons';

export type ConnectionQualityColorClass =
  | 'call-connection-indicator--excellent'
  | 'call-connection-indicator--good'
  | 'call-connection-indicator--poor'
  | 'call-connection-indicator--lost'
  | 'call-connection-indicator--unknown';

export interface NetworkConnectionInfo {
  effectiveType?: string;
  downlinkMbps?: number;
  rttMs?: number;
}

interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }
}

export function connectionQualityToIcon(quality: ConnectionQuality): AppIconName {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return 'signalBars';
    case ConnectionQuality.Good:
      return 'signalBarsGood';
    case ConnectionQuality.Poor:
      return 'signalBarsFair';
    case ConnectionQuality.Lost:
      return 'signalBarsWeak';
    default:
      return 'signalBarsFair';
  }
}

export function connectionQualityToColorClass(
  quality: ConnectionQuality,
): ConnectionQualityColorClass {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return 'call-connection-indicator--excellent';
    case ConnectionQuality.Good:
      return 'call-connection-indicator--good';
    case ConnectionQuality.Poor:
      return 'call-connection-indicator--poor';
    case ConnectionQuality.Lost:
      return 'call-connection-indicator--lost';
    default:
      return 'call-connection-indicator--unknown';
  }
}

export function connectionQualityLabelKey(quality: ConnectionQuality): string {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return 'call.connectionQualityExcellent';
    case ConnectionQuality.Good:
      return 'call.connectionQualityGood';
    case ConnectionQuality.Poor:
      return 'call.connectionQualityPoor';
    case ConnectionQuality.Lost:
      return 'call.connectionQualityLost';
    default:
      return 'call.connectionQualityUnknown';
  }
}

export function connectionStateLabelKey(state: ConnectionState): string {
  switch (state) {
    case ConnectionState.Connected:
      return 'call.connectionStateConnected';
    case ConnectionState.Connecting:
      return 'call.connectionStateConnecting';
    case ConnectionState.Reconnecting:
      return 'call.connectionStateReconnecting';
    case ConnectionState.SignalReconnecting:
      return 'call.connectionStateSignalReconnecting';
    default:
      return 'call.connectionStateDisconnected';
  }
}

export function chatConnectionStateLabelKey(state: ChatConnectionState): string {
  switch (state) {
    case 'connected':
      return 'call.chatConnectionConnected';
    case 'connecting':
      return 'call.chatConnectionConnecting';
    case 'reconnecting':
      return 'call.chatConnectionReconnecting';
    default:
      return 'call.chatConnectionDisconnected';
  }
}

export function isMediaConnectionUnstable(state: ConnectionState): boolean {
  return (
    state === ConnectionState.Reconnecting
    || state === ConnectionState.SignalReconnecting
    || state === ConnectionState.Connecting
  );
}

export function readNetworkConnectionInfo(): NetworkConnectionInfo | null {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const connection =
    navigator.connection
    ?? navigator.mozConnection
    ?? navigator.webkitConnection;

  if (!connection) {
    return null;
  }

  return {
    effectiveType: connection.effectiveType,
    downlinkMbps: typeof connection.downlink === 'number' ? connection.downlink : undefined,
    rttMs: typeof connection.rtt === 'number' ? Math.round(connection.rtt) : undefined,
  };
}

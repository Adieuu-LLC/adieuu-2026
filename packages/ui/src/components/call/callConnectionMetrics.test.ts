import { describe, expect, test } from 'bun:test';
import { ConnectionQuality, ConnectionState } from 'livekit-client';
import {
  chatConnectionStateLabelKey,
  connectionQualityLabelKey,
  connectionQualityToColorClass,
  connectionQualityToIcon,
  connectionStateLabelKey,
  isMediaConnectionUnstable,
  readNetworkConnectionInfo,
} from './callConnectionMetrics';

describe('connectionQualityToIcon', () => {
  test('maps LiveKit quality levels to signal bar icons', () => {
    expect(connectionQualityToIcon(ConnectionQuality.Excellent)).toBe('signalBars');
    expect(connectionQualityToIcon(ConnectionQuality.Good)).toBe('signalBarsGood');
    expect(connectionQualityToIcon(ConnectionQuality.Poor)).toBe('signalBarsFair');
    expect(connectionQualityToIcon(ConnectionQuality.Lost)).toBe('signalBarsWeak');
    expect(connectionQualityToIcon(ConnectionQuality.Unknown)).toBe('signalBarsFair');
  });
});

describe('connectionQualityToColorClass', () => {
  test('maps LiveKit quality levels to indicator color classes', () => {
    expect(connectionQualityToColorClass(ConnectionQuality.Excellent)).toBe(
      'call-connection-indicator--excellent',
    );
    expect(connectionQualityToColorClass(ConnectionQuality.Good)).toBe(
      'call-connection-indicator--good',
    );
    expect(connectionQualityToColorClass(ConnectionQuality.Poor)).toBe(
      'call-connection-indicator--poor',
    );
    expect(connectionQualityToColorClass(ConnectionQuality.Lost)).toBe(
      'call-connection-indicator--lost',
    );
    expect(connectionQualityToColorClass(ConnectionQuality.Unknown)).toBe(
      'call-connection-indicator--unknown',
    );
  });
});

describe('connectionQualityLabelKey', () => {
  test('returns i18n keys for each quality level', () => {
    expect(connectionQualityLabelKey(ConnectionQuality.Excellent)).toBe(
      'call.connectionQualityExcellent',
    );
    expect(connectionQualityLabelKey(ConnectionQuality.Lost)).toBe('call.connectionQualityLost');
  });
});

describe('connectionStateLabelKey', () => {
  test('returns i18n keys for media connection states', () => {
    expect(connectionStateLabelKey(ConnectionState.Connected)).toBe(
      'call.connectionStateConnected',
    );
    expect(connectionStateLabelKey(ConnectionState.Reconnecting)).toBe(
      'call.connectionStateReconnecting',
    );
  });
});

describe('chatConnectionStateLabelKey', () => {
  test('returns i18n keys for chat websocket states', () => {
    expect(chatConnectionStateLabelKey('connected')).toBe('call.chatConnectionConnected');
    expect(chatConnectionStateLabelKey('reconnecting')).toBe('call.chatConnectionReconnecting');
  });
});

describe('isMediaConnectionUnstable', () => {
  test('treats connecting and reconnecting states as unstable', () => {
    expect(isMediaConnectionUnstable(ConnectionState.Connected)).toBe(false);
    expect(isMediaConnectionUnstable(ConnectionState.Connecting)).toBe(true);
    expect(isMediaConnectionUnstable(ConnectionState.Reconnecting)).toBe(true);
    expect(isMediaConnectionUnstable(ConnectionState.SignalReconnecting)).toBe(true);
    expect(isMediaConnectionUnstable(ConnectionState.Disconnected)).toBe(false);
  });
});

describe('readNetworkConnectionInfo', () => {
  test('returns null when Network Information API is unavailable', () => {
    expect(readNetworkConnectionInfo()).toBeNull();
  });
});

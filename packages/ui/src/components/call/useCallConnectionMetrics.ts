import { useMemo } from 'react';
import {
  useConnectionQualityIndicator,
  useConnectionState,
  useLocalParticipant,
} from '@livekit/components-react';
import { ConnectionQuality } from 'livekit-client';
import { useChatSocket } from '../../hooks/useChatSocket';
import {
  connectionQualityLabelKey,
  connectionQualityToColorClass,
  connectionQualityToIcon,
  connectionStateLabelKey,
  isMediaConnectionUnstable,
  readNetworkConnectionInfo,
  type NetworkConnectionInfo,
  type ConnectionQualityColorClass,
} from './callConnectionMetrics';
import type { AppIconName } from '../../icons/appIcons';
import type { ConnectionState } from 'livekit-client';
import type { ChatConnectionState } from '@adieuu/shared';

export interface CallConnectionMetrics {
  quality: ConnectionQuality;
  connectionState: ConnectionState;
  qualityLabelKey: string;
  connectionStateLabelKey: string;
  iconName: AppIconName;
  colorClass: ConnectionQualityColorClass;
  lastHeartbeatRttMs: number | null;
  chatConnectionState: ChatConnectionState;
  networkInfo: NetworkConnectionInfo | null;
  showChatConnectionWarning: boolean;
  isUnstable: boolean;
}

export function useCallConnectionMetrics(): CallConnectionMetrics {
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });
  const connectionState = useConnectionState();
  const { connectionState: chatConnectionState, lastHeartbeatRttMs } = useChatSocket();

  const networkInfo = useMemo(() => readNetworkConnectionInfo(), []);

  const isUnstable = isMediaConnectionUnstable(connectionState);

  const displayQuality = isUnstable ? ConnectionQuality.Unknown : quality;

  return useMemo(
    () => ({
      quality: displayQuality,
      connectionState,
      qualityLabelKey: isUnstable
        ? 'call.connectionQualityReconnecting'
        : connectionQualityLabelKey(displayQuality),
      connectionStateLabelKey: connectionStateLabelKey(connectionState),
      iconName: connectionQualityToIcon(displayQuality),
      colorClass: connectionQualityToColorClass(displayQuality),
      lastHeartbeatRttMs,
      chatConnectionState,
      networkInfo,
      showChatConnectionWarning: chatConnectionState !== 'connected',
      isUnstable,
    }),
    [
      displayQuality,
      connectionState,
      isUnstable,
      lastHeartbeatRttMs,
      chatConnectionState,
      networkInfo,
    ],
  );
}

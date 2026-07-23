/**
 * LiveKit host for Space voice channels.
 *
 * The in-call UI (name, duration, controls) lives in the primary sidebar via
 * `SidebarCallWidget`; this overlay mounts the (hidden) LiveKit room so audio
 * keeps flowing across navigation, and hosts the optional pre-join device modal.
 */

import { lazy, Suspense, useCallback, useEffect } from 'react';
import { useVoiceChannelSession } from '../../hooks/useVoiceChannelSession';
import { CallDeviceSetupModal, type CallDeviceSelection } from './CallDeviceSetupModal';

const CallRoom = lazy(() => import('./CallRoom'));

export function VoiceChannelOverlay() {
  const {
    joined,
    phase,
    pendingDeviceSetup,
    livekitUrl,
    livekitToken,
    callE2EEKey,
    e2eeSupported,
    confirmVoiceDeviceSetup,
    cancelVoiceDeviceSetup,
  } = useVoiceChannelSession();

  useEffect(() => {
    if (
      phase === 'device-setup' ||
      phase === 'connecting' ||
      phase === 'live' ||
      (livekitUrl && livekitToken)
    ) {
      void import('./CallRoom');
    }
  }, [phase, livekitUrl, livekitToken]);

  const handleConfirmDevices = useCallback(
    async (devices: CallDeviceSelection) => {
      await confirmVoiceDeviceSetup(devices);
    },
    [confirmVoiceDeviceSetup],
  );

  return (
    <>
      <CallDeviceSetupModal
        open={phase === 'device-setup' && pendingDeviceSetup !== null}
        variant="voice"
        onConfirm={(devices) => void handleConfirmDevices(devices)}
        onCancel={cancelVoiceDeviceSetup}
      />

      {joined && livekitUrl && livekitToken && (
        <div className="voice-channel-livekit" aria-hidden>
          <Suspense fallback={null}>
            <CallRoom
              serverUrl={livekitUrl}
              token={livekitToken}
              callE2EEKey={callE2EEKey}
              e2eeSupported={e2eeSupported}
              streamQualityCaps={null}
              isDm={false}
              isExpanded={false}
              onToggleFullscreen={() => {}}
              onTroubleshoot={() => {}}
              onConnected={() => {}}
              onDisconnected={() => {}}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}

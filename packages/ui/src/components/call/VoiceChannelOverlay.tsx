/**
 * LiveKit host for Space voice channels (auto-connect, no device modal).
 *
 * The in-call UI (name, duration, controls) lives in the primary sidebar via
 * `SidebarCallWidget`; this overlay only mounts the (hidden) LiveKit room so
 * audio keeps flowing across navigation.
 */

import { lazy, Suspense, useEffect } from 'react';
import { useVoiceChannelSession } from '../../hooks/useVoiceChannelSession';

const CallRoom = lazy(() => import('./CallRoom'));

export function VoiceChannelOverlay() {
  const { joined, phase, livekitUrl, livekitToken, callE2EEKey, e2eeSupported } =
    useVoiceChannelSession();

  useEffect(() => {
    if (phase === 'connecting' || phase === 'live' || (livekitUrl && livekitToken)) {
      void import('./CallRoom');
    }
  }, [phase, livekitUrl, livekitToken]);

  if (!joined) return null;

  return (
    <>
      {livekitUrl && livekitToken && (
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

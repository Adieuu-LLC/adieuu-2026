/**
 * LiveKit overlay for Space voice channels (auto-connect, no device modal).
 */

import { lazy, Suspense, useEffect } from 'react';
import { useVoiceChannelSession } from '../../hooks/useVoiceChannelSession';
import { VoiceChannelBar } from './VoiceChannelBar';

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
      <VoiceChannelBar />
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

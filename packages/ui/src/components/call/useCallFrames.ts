import { useMemo } from 'react';
import { useParticipants, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { buildCallFrames } from './callFrameLayoutLogic';
import type { CallFrame } from './callFrameTypes';

export interface UseCallFramesResult {
  frames: CallFrame[];
  cameraTrackMap: Map<string, TrackReferenceOrPlaceholder>;
  screenTrackMap: Map<string, TrackReferenceOrPlaceholder>;
}

export function useCallFrames(): UseCallFramesResult {
  const participants = useParticipants();

  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  const screenTracks = useTracks(
    [Track.Source.ScreenShare],
    { onlySubscribed: false },
  );

  const cameraTrackMap = useMemo(() => {
    const map = new Map<string, TrackReferenceOrPlaceholder>();
    for (const trackRef of cameraTracks) {
      if (trackRef.participant) {
        map.set(trackRef.participant.identity, trackRef);
      }
    }
    return map;
  }, [cameraTracks]);

  const screenTrackMap = useMemo(() => {
    const map = new Map<string, TrackReferenceOrPlaceholder>();
    for (const trackRef of screenTracks) {
      if (trackRef.participant) {
        map.set(trackRef.participant.identity, trackRef);
      }
    }
    return map;
  }, [screenTracks]);

  const frames = useMemo(
    () => buildCallFrames(participants, cameraTrackMap, screenTrackMap),
    [participants, cameraTrackMap, screenTrackMap],
  );

  return { frames, cameraTrackMap, screenTrackMap };
}

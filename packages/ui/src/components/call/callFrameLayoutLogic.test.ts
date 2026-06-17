import { describe, expect, test } from 'bun:test';
import { Track } from 'livekit-client';
import type { Participant } from 'livekit-client';
import {
  buildCallFrames,
  compareFramesBySpeakingPriority,
  computePinnedLayout,
  getDmSplitFrames,
  resolveLayoutMode,
  selectAutoPinScreenShareFrameId,
  selectDefaultHeroFrameId,
} from './callFrameLayoutLogic';
import type { CallFrame } from './callFrameTypes';
import { makeFrameId } from './callFrameTypes';

function mockParticipant(overrides: {
  identity: string;
  isSpeaking?: boolean;
  lastSpokeAt?: Date;
  cameraMuted?: boolean;
  screenMuted?: boolean;
  screenEnabled?: boolean;
}): Participant {
  const {
    identity,
    isSpeaking = false,
    lastSpokeAt,
    cameraMuted = false,
    screenMuted = true,
    screenEnabled = false,
  } = overrides;

  return {
    identity,
    name: identity,
    isSpeaking,
    lastSpokeAt,
    getTrackPublication(source: Track.Source) {
      if (source === Track.Source.Camera) {
        return cameraMuted ? undefined : { isMuted: false, isSubscribed: true };
      }
      if (source === Track.Source.ScreenShare) {
        if (!screenEnabled) return undefined;
        return { isMuted: screenMuted, isSubscribed: true, track: {} };
      }
      return undefined;
    },
  } as unknown as Participant;
}

function frame(
  identity: string,
  source: 'camera' | 'screenshare',
  participant: Participant,
): CallFrame {
  return {
    id: makeFrameId(identity, source),
    participantIdentity: identity,
    source,
    participant,
  };
}

describe('buildCallFrames', () => {
  test('includes camera and screenshare frames per participant', () => {
    const local = mockParticipant({ identity: 'local' });
    const remote = mockParticipant({ identity: 'remote', screenEnabled: true, screenMuted: false });

    const frames = buildCallFrames(
      [local, remote],
      new Map([
        ['local', { participant: local }],
        ['remote', { participant: remote }],
      ]),
      new Map([['remote', { participant: remote }]]),
    );

    expect(frames).toHaveLength(3);
    expect(frames.map((f) => f.id)).toEqual([
      'local:camera',
      'remote:camera',
      'remote:screenshare',
    ]);
  });
});

describe('selectDefaultHeroFrameId', () => {
  test('DM defaults to remote camera', () => {
    const local = mockParticipant({ identity: 'local' });
    const remote = mockParticipant({ identity: 'remote' });
    const frames = [
      frame('local', 'camera', local),
      frame('remote', 'camera', remote),
    ];

    expect(selectDefaultHeroFrameId(frames, 'local', true)).toBe('remote:camera');
  });

  test('prefers active screenshare as hero', () => {
    const local = mockParticipant({ identity: 'local' });
    const remote = mockParticipant({
      identity: 'remote',
      screenEnabled: true,
      screenMuted: false,
    });
    const frames = [
      frame('local', 'camera', local),
      frame('remote', 'camera', remote),
      frame('remote', 'screenshare', remote),
    ];

    expect(selectDefaultHeroFrameId(frames, 'local', true)).toBe('remote:screenshare');
  });

  test('group prefers speaking participant', () => {
    const local = mockParticipant({ identity: 'local' });
    const remote = mockParticipant({
      identity: 'remote',
      isSpeaking: true,
      lastSpokeAt: new Date('2026-06-01T12:00:00Z'),
    });
    const other = mockParticipant({ identity: 'other' });
    const frames = [
      frame('local', 'camera', local),
      frame('remote', 'camera', remote),
      frame('other', 'camera', other),
    ];

    expect(selectDefaultHeroFrameId(frames, 'local', false)).toBe('remote:camera');
  });
});

describe('compareFramesBySpeakingPriority', () => {
  test('orders speaking before silent, then by recency', () => {
    const speaking = mockParticipant({
      identity: 'a',
      isSpeaking: true,
      lastSpokeAt: new Date('2026-06-01T11:00:00Z'),
    });
    const recent = mockParticipant({
      identity: 'b',
      lastSpokeAt: new Date('2026-06-01T12:00:00Z'),
    });
    const frames = [
      frame('b', 'camera', recent),
      frame('a', 'camera', speaking),
    ];

    const sorted = [...frames].sort(compareFramesBySpeakingPriority);
    expect(sorted[0]?.id).toBe('a:camera');
  });

  test('prefers screenshare over camera for same participant tie', () => {
    const participant = mockParticipant({ identity: 'remote' });
    const camera = frame('remote', 'camera', participant);
    const screen = frame('remote', 'screenshare', participant);

    expect(compareFramesBySpeakingPriority(screen, camera)).toBeLessThan(0);
  });
});

describe('computePinnedLayout', () => {
  test('caps sidebar at three and sends remainder to overflow', () => {
    const participants = ['a', 'b', 'c', 'd', 'e'].map((identity) =>
      mockParticipant({ identity }),
    );
    const frames = participants.flatMap((participant) => [
      frame(participant.identity, 'camera', participant),
    ]);
    const pinnedId = 'a:camera';

    const result = computePinnedLayout(frames, pinnedId, null);
    expect(result?.hero.id).toBe('a:camera');
    expect(result?.sidebar).toHaveLength(3);
    expect(result?.overflow).toHaveLength(1);
  });

  test('promotion moves overflow frame to sidebar slot one', () => {
    const a = mockParticipant({ identity: 'a' });
    const b = mockParticipant({ identity: 'b', isSpeaking: true });
    const c = mockParticipant({ identity: 'c' });
    const d = mockParticipant({ identity: 'd' });
    const frames = [a, b, c, d].flatMap((participant) => [
      frame(participant.identity, 'camera', participant),
    ]);

    const withoutPromotion = computePinnedLayout(frames, 'a:camera', null);
    expect(withoutPromotion?.sidebar[0]?.id).toBe('b:camera');

    const withPromotion = computePinnedLayout(frames, 'a:camera', 'd:camera');
    expect(withPromotion?.sidebar[0]?.id).toBe('d:camera');
    expect(withPromotion?.sidebar.some((f) => f.id === 'b:camera')).toBe(true);
    expect(withPromotion?.overflow.some((f) => f.id === 'd:camera')).toBe(false);
  });

  test('solo mode sends every other frame to overflow', () => {
    const participants = ['a', 'b', 'c', 'd'].map((identity) =>
      mockParticipant({ identity }),
    );
    const frames = participants.flatMap((participant) => [
      frame(participant.identity, 'camera', participant),
    ]);

    const result = computePinnedLayout(frames, 'a:camera', null, true);
    expect(result?.hero.id).toBe('a:camera');
    expect(result?.sidebar).toHaveLength(0);
    expect(result?.overflow).toHaveLength(3);
  });
});

describe('selectAutoPinScreenShareFrameId', () => {
  test('auto-pins active screenshare when nothing is pinned', () => {
    const remote = mockParticipant({
      identity: 'remote',
      screenEnabled: true,
      screenMuted: false,
    });
    const frames = [
      frame('remote', 'camera', remote),
      frame('remote', 'screenshare', remote),
    ];

    expect(
      selectAutoPinScreenShareFrameId(frames, null, false, new Set()),
    ).toBe('remote:screenshare');
  });

  test('does not auto-pin when another frame is pinned', () => {
    const remote = mockParticipant({
      identity: 'remote',
      screenEnabled: true,
      screenMuted: false,
    });
    const frames = [
      frame('remote', 'camera', remote),
      frame('remote', 'screenshare', remote),
    ];

    expect(
      selectAutoPinScreenShareFrameId(frames, 'remote:camera', false, new Set()),
    ).toBe('remote:camera');
  });

  test('does not auto-pin after user declined while sharing', () => {
    const remote = mockParticipant({
      identity: 'remote',
      screenEnabled: true,
      screenMuted: false,
    });
    const frames = [frame('remote', 'screenshare', remote)];

    expect(
      selectAutoPinScreenShareFrameId(frames, null, true, new Set(['remote:screenshare'])),
    ).toBeNull();
  });

  test('prefers newly appeared screenshare over an existing one', () => {
    const a = mockParticipant({ identity: 'a', screenEnabled: true, screenMuted: false });
    const b = mockParticipant({ identity: 'b', screenEnabled: true, screenMuted: false });
    const frames = [
      frame('a', 'screenshare', a),
      frame('b', 'screenshare', b),
    ];

    expect(
      selectAutoPinScreenShareFrameId(frames, null, false, new Set(['a:screenshare'])),
    ).toBe('b:screenshare');
  });
});

describe('resolveLayoutMode', () => {
  test('pinned mode takes precedence', () => {
    expect(resolveLayoutMode('x:camera', true, 2, false, false)).toBe('pinned');
  });

  test('DM with two participants uses dm-split when unpinned and no screenshare', () => {
    expect(resolveLayoutMode(null, true, 2, false, false)).toBe('dm-split');
  });

  test('DM with screenshare uses grid on desktop', () => {
    expect(resolveLayoutMode(null, true, 2, false, true)).toBe('grid');
  });

  test('DM with screenshare uses mobile-stage on mobile', () => {
    expect(resolveLayoutMode(null, true, 2, true, true)).toBe('mobile-stage');
  });

  test('mobile group uses mobile-stage when unpinned', () => {
    expect(resolveLayoutMode(null, false, 3, true, false)).toBe('mobile-stage');
  });
});

describe('getDmSplitFrames', () => {
  test('returns remote then local primary camera frames', () => {
    const local = mockParticipant({ identity: 'local' });
    const remote = mockParticipant({ identity: 'remote', screenEnabled: true, screenMuted: false });
    const frames = buildCallFrames(
      [local, remote],
      new Map([
        ['local', { participant: local }],
        ['remote', { participant: remote }],
      ]),
      new Map([['remote', { participant: remote }]]),
    );

    const split = getDmSplitFrames(frames, 'local');
    expect(split.map((f) => f.id)).toEqual(['remote:camera', 'local:camera']);
  });
});

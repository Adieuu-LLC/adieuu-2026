import { beforeEach, describe, expect, test } from 'bun:test';
import {
  registerRoom,
  unregisterRoom,
  getCallControlsSnapshot,
  updateLocalMediaState,
  toggleMic,
  toggleDeafen,
  isDeafened,
  applyOutputToAllRemotes,
  __resetLivekitRoomHandleForTests,
} from './livekitRoomHandle';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}

interface FakeRemote {
  volume: number | null;
  setVolume(v: number): void;
}

function makeRemote(): FakeRemote {
  return {
    volume: null,
    setVolume(v: number) {
      this.volume = v;
    },
  };
}

function makeRoom(remotes: Map<string, FakeRemote>) {
  const localParticipant = {
    isMicrophoneEnabled: true,
    isCameraEnabled: false,
    isScreenShareEnabled: false,
    async setMicrophoneEnabled(v: boolean) {
      this.isMicrophoneEnabled = v;
    },
    async setCameraEnabled(v: boolean) {
      this.isCameraEnabled = v;
    },
    async setScreenShareEnabled(v: boolean) {
      this.isScreenShareEnabled = v;
    },
  };
  return { localParticipant, remoteParticipants: remotes } as unknown as import('livekit-client').Room;
}

describe('livekitRoomHandle', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
    __resetLivekitRoomHandleForTests();
  });

  test('snapshot reports no room until one is registered', () => {
    expect(getCallControlsSnapshot().hasRoom).toBe(false);
    const room = makeRoom(new Map());
    registerRoom(room);
    expect(getCallControlsSnapshot().hasRoom).toBe(true);
    unregisterRoom(room);
    expect(getCallControlsSnapshot().hasRoom).toBe(false);
  });

  test('updateLocalMediaState is reflected in the snapshot', () => {
    const room = makeRoom(new Map());
    registerRoom(room);
    updateLocalMediaState({ micEnabled: true, cameraEnabled: true, screenShareEnabled: false });
    const snap = getCallControlsSnapshot();
    expect(snap.micEnabled).toBe(true);
    expect(snap.cameraEnabled).toBe(true);
    expect(snap.screenShareEnabled).toBe(false);
  });

  test('toggleMic flips the local mic publish state', async () => {
    const room = makeRoom(new Map());
    registerRoom(room);
    expect(room.localParticipant.isMicrophoneEnabled).toBe(true);
    await toggleMic();
    expect(room.localParticipant.isMicrophoneEnabled).toBe(false);
  });

  test('deafen mutes remotes + mic and undeafen restores them', async () => {
    const a = makeRemote();
    const b = makeRemote();
    const room = makeRoom(new Map<string, FakeRemote>([['a', a], ['b', b]]));
    registerRoom(room);

    // Output volume default is unity gain.
    applyOutputToAllRemotes();
    expect(a.volume).toBe(1);
    expect(b.volume).toBe(1);

    await toggleDeafen();
    expect(isDeafened()).toBe(true);
    expect(a.volume).toBe(0);
    expect(b.volume).toBe(0);
    expect(room.localParticipant.isMicrophoneEnabled).toBe(false);

    await toggleDeafen();
    expect(isDeafened()).toBe(false);
    expect(a.volume).toBe(1);
    expect(b.volume).toBe(1);
    expect(room.localParticipant.isMicrophoneEnabled).toBe(true);
  });

  test('output volume preference is applied to remotes', () => {
    localStorage.setItem('adieuu.app.av.outputVolume', '150');
    const a = makeRemote();
    const room = makeRoom(new Map<string, FakeRemote>([['a', a]]));
    registerRoom(room);
    applyOutputToAllRemotes();
    expect(a.volume).toBeCloseTo(1.5, 5);
  });
});

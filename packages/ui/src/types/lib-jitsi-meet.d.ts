/**
 * lib-jitsi-meet ships without a package.json "types" entry, so TypeScript
 * cannot resolve the module via bundler resolution. These declarations match
 * the subset used by jitsiService.ts.
 */
declare module 'lib-jitsi-meet' {
  interface JitsiMeetJSType {
    init(options?: Record<string, unknown>): void;
    setLogLevel(level: string): void;
    JitsiConnection: new (
      appId: string | null,
      token: string | null,
      options: Record<string, unknown>
    ) => JitsiConnection;
    events: {
      connection: {
        CONNECTION_ESTABLISHED: string;
        CONNECTION_FAILED: string;
        CONNECTION_DISCONNECTED: string;
      };
      conference: {
        TRACK_ADDED: string;
        TRACK_REMOVED: string;
        CONFERENCE_JOINED: string;
        CONFERENCE_LEFT: string;
        USER_JOINED: string;
        USER_LEFT: string;
        CONFERENCE_FAILED: string;
        CONFERENCE_ERROR: string;
      };
    };
    errors: {
      connection: Record<string, string>;
      conference: Record<string, string>;
    };
    createLocalTracks(
      options: Record<string, unknown>
    ): Promise<JitsiLocalTrack[]>;
    mediaDevices: {
      enumerateDevices(callback: (devices: MediaDeviceInfo[]) => void): void;
    };
  }

  interface JitsiConnection {
    addEventListener(event: string, handler: (...args: unknown[]) => void): void;
    removeEventListener(event: string, handler: (...args: unknown[]) => void): void;
    connect(): void;
    disconnect(): void;
    initJitsiConference(roomName: string, options: Record<string, unknown>): JitsiConference;
  }

  interface JitsiConference {
    join(password?: string): void;
    leave(): Promise<void>;
    setE2EEKey(key: Uint8Array | string): void;
    addTrack(track: JitsiLocalTrack): Promise<void>;
    removeTrack(track: JitsiLocalTrack): Promise<void>;
    addEventListener(event: string, handler: (...args: unknown[]) => void): void;
    removeEventListener(event: string, handler: (...args: unknown[]) => void): void;
    getLocalTracks(): JitsiLocalTrack[];
    myUserId(): string;
  }

  interface JitsiTrack {
    getType(): 'audio' | 'video';
    getId(): string;
    getParticipantId(): string;
    isLocal(): boolean;
    isMuted(): boolean;
    attach(element: HTMLElement): void;
    detach(element: HTMLElement): void;
    dispose(): Promise<void>;
  }

  interface JitsiLocalTrack extends JitsiTrack {
    mute(): Promise<void>;
    unmute(): Promise<void>;
    getVideoType(): 'camera' | 'desktop' | undefined;
  }

  const JitsiMeetJS: JitsiMeetJSType;
  export default JitsiMeetJS;
  export type {
    JitsiMeetJSType,
    JitsiConnection,
    JitsiConference,
    JitsiTrack,
    JitsiLocalTrack,
  };
}

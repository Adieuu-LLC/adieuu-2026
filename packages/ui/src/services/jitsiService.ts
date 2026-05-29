/**
 * Jitsi Service
 *
 * Wraps lib-jitsi-meet for managing a single Jitsi conference connection.
 * Handles local tracks (audio, video, screenshare), remote track events,
 * and Adieuu-managed E2EE key injection via `conference.setE2EEKey()`.
 *
 * The E2EE key is generated/derived by @adieuu/crypto and distributed
 * out-of-band; this service only injects the key into Jitsi's Insertable
 * Streams E2EE layer (AES-GCM-128 JFrame in v1).
 *
 * @module services/jitsiService
 */

import JitsiMeetJS from 'lib-jitsi-meet';
import type {
  JitsiConnection,
  JitsiConference,
  JitsiLocalTrack,
  JitsiTrack,
} from 'lib-jitsi-meet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JitsiServiceConfig {
  /** Jitsi server hostname (e.g. meet.adieuu.com) */
  serverHost: string;
  /** Jitsi BOSH or WebSocket URL */
  serviceUrl: string;
}

export type JitsiServiceEvent =
  | { type: 'conference_joined' }
  | { type: 'conference_left' }
  | { type: 'conference_failed'; error: string }
  | { type: 'remote_track_added'; track: JitsiTrack; participantId: string }
  | { type: 'remote_track_removed'; track: JitsiTrack; participantId: string }
  | { type: 'participant_joined'; participantId: string }
  | { type: 'participant_left'; participantId: string }
  | { type: 'connection_failed'; error: string };

export type JitsiEventHandler = (event: JitsiServiceEvent) => void;

// ---------------------------------------------------------------------------
// Jitsi Service
// ---------------------------------------------------------------------------

let jitsiInitialized = false;

export class JitsiService {
  private config: JitsiServiceConfig;
  private connection: JitsiConnection | null = null;
  private conference: JitsiConference | null = null;
  private localTracks: JitsiLocalTrack[] = [];
  private eventHandlers = new Set<JitsiEventHandler>();
  private disposed = false;

  constructor(config: JitsiServiceConfig) {
    this.config = config;

    if (!jitsiInitialized) {
      JitsiMeetJS.init({
        disableAudioLevels: true,
      });
      JitsiMeetJS.setLogLevel('error');
      jitsiInitialized = true;
    }
  }

  // ---- Public API ----

  /**
   * Subscribe to Jitsi service events.
   * Returns an unsubscribe function.
   */
  on(handler: JitsiEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /**
   * Connect to the Jitsi server and join a conference room.
   */
  async connect(roomName: string, jwt: string): Promise<void> {
    if (this.disposed) return;

    return new Promise<void>((resolve, reject) => {
      const connectionOptions: Record<string, unknown> = {
        hosts: {
          domain: this.config.serverHost,
          muc: `conference.${this.config.serverHost}`,
        },
        serviceUrl: this.config.serviceUrl,
      };

      this.connection = new JitsiMeetJS.JitsiConnection(null, jwt, connectionOptions);

      const onEstablished = () => {
        this.connection?.removeEventListener(
          JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
          onEstablished
        );
        this.connection?.removeEventListener(
          JitsiMeetJS.events.connection.CONNECTION_FAILED,
          onFailed
        );
        this.joinConference(roomName).then(resolve, reject);
      };

      const onFailed = (_error: unknown) => {
        this.connection?.removeEventListener(
          JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
          onEstablished
        );
        this.connection?.removeEventListener(
          JitsiMeetJS.events.connection.CONNECTION_FAILED,
          onFailed
        );
        const errMsg = typeof _error === 'string' ? _error : 'Connection failed';
        this.emit({ type: 'connection_failed', error: errMsg });
        reject(new Error(errMsg));
      };

      this.connection.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        onEstablished
      );
      this.connection.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        onFailed
      );

      this.connection.connect();
    });
  }

  /**
   * Inject the Adieuu-managed E2EE key into the Jitsi conference.
   * Must be called after the conference is joined.
   */
  setE2EEKey(key: Uint8Array): void {
    if (!this.conference) {
      throw new Error('Cannot set E2EE key before joining a conference');
    }
    this.conference.setE2EEKey(key);
  }

  /**
   * Create and add local audio/video tracks to the conference.
   */
  async createLocalTracks(options: {
    audio: boolean;
    video: boolean;
  }): Promise<JitsiLocalTrack[]> {
    const devices: string[] = [];
    if (options.audio) devices.push('audio');
    if (options.video) devices.push('video');

    if (devices.length === 0) return [];

    const tracks = await JitsiMeetJS.createLocalTracks({ devices });
    this.localTracks.push(...tracks);

    if (this.conference) {
      for (const track of tracks) {
        await this.conference.addTrack(track);
      }
    }

    return tracks;
  }

  /**
   * Create a local screenshare track and add it to the conference.
   * Returns the track, or null if the user cancelled the picker.
   */
  async startScreenshare(): Promise<JitsiLocalTrack | null> {
    try {
      const tracks = await JitsiMeetJS.createLocalTracks({
        devices: ['desktop'],
      });
      const desktopTrack = tracks[0];
      if (!desktopTrack) return null;

      this.localTracks.push(desktopTrack);
      if (this.conference) {
        await this.conference.addTrack(desktopTrack);
      }
      return desktopTrack;
    } catch {
      return null;
    }
  }

  /**
   * Stop and remove a screenshare track from the conference.
   */
  async stopScreenshare(): Promise<void> {
    const desktopTracks = this.localTracks.filter(
      (t) => t.getType() === 'video' && t.getVideoType() === 'desktop'
    );

    for (const track of desktopTracks) {
      if (this.conference) {
        await this.conference.removeTrack(track);
      }
      await track.dispose();
      this.localTracks = this.localTracks.filter((t) => t !== track);
    }
  }

  /**
   * Mute or unmute a local track by type.
   */
  async setTrackMuted(type: 'audio' | 'video', muted: boolean): Promise<void> {
    const track = this.localTracks.find((t) => {
      if (t.getType() !== type) return false;
      if (type === 'video' && t.getVideoType() === 'desktop') return false;
      return true;
    });

    if (!track) return;

    if (muted) {
      await track.mute();
    } else {
      await track.unmute();
    }
  }

  /**
   * Get current local tracks.
   */
  getLocalTracks(): JitsiLocalTrack[] {
    return [...this.localTracks];
  }

  /**
   * Disconnect from the conference and clean up all resources.
   */
  async disconnect(): Promise<void> {
    this.disposed = true;

    for (const track of this.localTracks) {
      try {
        await track.dispose();
      } catch {
        // Best-effort track cleanup
      }
    }
    this.localTracks = [];

    if (this.conference) {
      try {
        await this.conference.leave();
      } catch {
        // Best-effort leave
      }
      this.conference = null;
    }

    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }

    this.eventHandlers.clear();
  }

  // ---- Internal ----

  private async joinConference(roomName: string): Promise<void> {
    if (!this.connection || this.disposed) return;

    this.conference = this.connection.initJitsiConference(roomName, {
      openBridgeChannel: true,
      e2ee: { enabled: true },
    });

    const events = JitsiMeetJS.events.conference;

    this.conference.addEventListener(events.CONFERENCE_JOINED, () => {
      this.emit({ type: 'conference_joined' });
    });

    this.conference.addEventListener(events.CONFERENCE_LEFT, () => {
      this.emit({ type: 'conference_left' });
    });

    this.conference.addEventListener(events.CONFERENCE_FAILED, (error: unknown) => {
      const errMsg = typeof error === 'string' ? error : 'Conference failed';
      this.emit({ type: 'conference_failed', error: errMsg });
    });

    this.conference.addEventListener(events.TRACK_ADDED, (track: unknown) => {
      const jitsiTrack = track as JitsiTrack;
      if (jitsiTrack.isLocal()) return;
      this.emit({
        type: 'remote_track_added',
        track: jitsiTrack,
        participantId: jitsiTrack.getParticipantId(),
      });
    });

    this.conference.addEventListener(events.TRACK_REMOVED, (track: unknown) => {
      const jitsiTrack = track as JitsiTrack;
      if (jitsiTrack.isLocal()) return;
      this.emit({
        type: 'remote_track_removed',
        track: jitsiTrack,
        participantId: jitsiTrack.getParticipantId(),
      });
    });

    this.conference.addEventListener(events.USER_JOINED, (participantId: unknown) => {
      this.emit({ type: 'participant_joined', participantId: String(participantId) });
    });

    this.conference.addEventListener(events.USER_LEFT, (participantId: unknown) => {
      this.emit({ type: 'participant_left', participantId: String(participantId) });
    });

    return new Promise<void>((resolve, reject) => {
      const onJoined = () => {
        this.conference?.removeEventListener(events.CONFERENCE_JOINED, onJoined);
        this.conference?.removeEventListener(events.CONFERENCE_FAILED, onFailed);
        resolve();
      };

      const onFailed = (error: unknown) => {
        this.conference?.removeEventListener(events.CONFERENCE_JOINED, onJoined);
        this.conference?.removeEventListener(events.CONFERENCE_FAILED, onFailed);
        reject(new Error(typeof error === 'string' ? error : 'Conference join failed'));
      };

      this.conference!.addEventListener(events.CONFERENCE_JOINED, onJoined);
      this.conference!.addEventListener(events.CONFERENCE_FAILED, onFailed);
      this.conference!.join();
    });
  }

  private emit(event: JitsiServiceEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('[JitsiService] Event handler error:', err);
      }
    }
  }
}

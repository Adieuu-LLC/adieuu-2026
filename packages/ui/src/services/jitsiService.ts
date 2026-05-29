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
  JitsiParticipant,
  JitsiTrack,
} from 'lib-jitsi-meet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JitsiServiceConfig {
  /** Jitsi server hostname used for the WebSocket connection URL */
  serverHost: string;
  /** Jitsi BOSH or WebSocket URL */
  serviceUrl: string;
  /**
   * XMPP virtual-host domain that Prosody serves (e.g. "meet.jitsi").
   * When omitted, falls back to `serverHost`. Must be set when the
   * connection URL hostname differs from the Prosody XMPP domain
   * (common in local dev: connect to localhost, XMPP domain is meet.jitsi).
   */
  xmppDomain?: string;
  /**
   * XMPP MUC component domain for conference rooms (e.g. "muc.meet.jitsi").
   * When omitted, defaults to "muc.${xmppDomain ?? serverHost}".
   */
  mucDomain?: string;
}

export type JitsiServiceEvent =
  | { type: 'conference_joined' }
  | { type: 'conference_left' }
  | { type: 'conference_failed'; error: string }
  | { type: 'remote_track_added'; track: JitsiTrack; participantId: string }
  | { type: 'remote_track_removed'; track: JitsiTrack; participantId: string }
  | { type: 'participant_joined'; participantId: string; identityId?: string }
  | { type: 'participant_left'; participantId: string }
  | { type: 'participant_property_changed'; participantId: string; propertyName: string; value: unknown }
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
      const domain = this.config.xmppDomain ?? this.config.serverHost;
      const muc = this.config.mucDomain ?? `muc.${domain}`;
      const connectionOptions: Record<string, unknown> = {
        hosts: {
          domain,
          muc,
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
   * Broadcast a custom property (e.g. `identityId`) to all conference
   * participants via XMPP presence. Other clients receive a
   * `participant_property_changed` event.
   */
  setLocalProperty(name: string, value: string): void {
    this.conference?.setLocalParticipantProperty(name, value);
  }

  /**
   * Returns the Jitsi-assigned participant ID for the local user,
   * or null if the conference has not been joined yet.
   */
  getMyParticipantId(): string | null {
    return this.conference?.myUserId() ?? null;
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
   * Disconnect from the conference and clean up connection resources.
   * The instance remains usable for a future connect().
   */
  async disconnect(): Promise<void> {
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
  }

  /**
   * Permanently tear down the service. After dispose(), connect() is a no-op.
   */
  async dispose(): Promise<void> {
    await this.disconnect();
    this.disposed = true;
    this.eventHandlers.clear();
  }

  // ---- Internal ----

  private async joinConference(roomName: string): Promise<void> {
    if (!this.connection || this.disposed) return;

    this.conference = this.connection.initJitsiConference(roomName, {
      openBridgeChannel: true,
      // E2EE is disabled until the Adieuu crypto key-distribution layer
      // calls setE2EEKey() after conference join.  Enabling the Insertable
      // Streams transform without a key garbles all audio/video frames.
      e2ee: { enabled: false },
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

    this.conference.addEventListener(events.USER_JOINED, (id: unknown) => {
      const jitsiId = String(id);
      const participant = this.conference?.getParticipantById(jitsiId);
      const identityId = participant?.getProperty('identityId');
      this.emit({
        type: 'participant_joined',
        participantId: jitsiId,
        identityId: typeof identityId === 'string' ? identityId : undefined,
      });
    });

    this.conference.addEventListener(events.USER_LEFT, (participantId: unknown) => {
      this.emit({ type: 'participant_left', participantId: String(participantId) });
    });

    this.conference.addEventListener(
      events.PARTICIPANT_PROPERTY_CHANGED,
      (participant: unknown, name: unknown, _oldValue: unknown, newValue: unknown) => {
        const p = participant as JitsiParticipant;
        this.emit({
          type: 'participant_property_changed',
          participantId: p.getId(),
          propertyName: String(name),
          value: newValue,
        });
      },
    );

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

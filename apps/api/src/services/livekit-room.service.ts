/**
 * LiveKit Room Management Service
 *
 * Provides server-side control over LiveKit rooms and participants using
 * the RoomServiceClient from livekit-server-sdk. Used for:
 * - Removing participants when they leave a call (immediate disconnect)
 * - Deleting rooms when a call ends (frees all server-side resources)
 * - Cleaning up orphaned rooms during call reaping
 *
 * All operations are best-effort and log failures without throwing,
 * since the primary source of truth is MongoDB (not LiveKit state).
 *
 * @module services/livekit-room
 */

import { RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../config';
import elog from '../utils/adieuuLogger';

let _client: RoomServiceClient | null = null;

function getClient(): RoomServiceClient | null {
  if (!config.livekit.enabled || !config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) {
    return null;
  }

  if (!_client) {
    const httpUrl = config.livekit.url
      .replace('ws://', 'http://')
      .replace('wss://', 'https://');
    _client = new RoomServiceClient(httpUrl, config.livekit.apiKey, config.livekit.apiSecret);
  }

  return _client;
}

/**
 * Remove a participant from a LiveKit room.
 * This immediately disconnects them from the media session.
 * Best-effort: logs and swallows errors (participant may have already left).
 */
export async function removeParticipant(roomName: string, identityId: string): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    await client.removeParticipant(roomName, identityId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found') || msg.includes('participant')) {
      return;
    }
    elog.warn('Failed to remove participant from LiveKit room', { roomName, identityId, err });
  }
}

/**
 * Delete a LiveKit room entirely.
 * This force-disconnects all participants and frees all server resources.
 * Best-effort: logs and swallows errors (room may have already been cleaned up).
 */
export async function deleteRoom(roomName: string): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    await client.deleteRoom(roomName);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found') || msg.includes('room')) {
      return;
    }
    elog.warn('Failed to delete LiveKit room', { roomName, err });
  }
}

import { getDeviceKeysForIdentity, decryptDeviceKeys } from '../../services/deviceKeyStorage';

export interface LoadedDecryptKeys {
  ecdhPrivateKey: Uint8Array | null;
  kemPrivateKey: Uint8Array | null;
  myRoutingTag?: string;
}

/**
 * Matches legacy `fetchMessages` device-key loading (verbose warnings).
 * Pass the same `deviceId` / `wrappingKey` values used for `decryptMessageBatch` (single lookup).
 */
export async function loadDecryptKeysVerbose(
  identityId: string,
  deviceId: string | null,
  wrappingKey: Uint8Array | null
): Promise<LoadedDecryptKeys> {
  let ecdhPrivateKey: Uint8Array | null = null;
  let kemPrivateKey: Uint8Array | null = null;
  let myRoutingTag: string | undefined;

  if (!deviceId) {
    console.warn('[Conversations] decrypt: no deviceId available');
  }
  if (!wrappingKey) {
    console.warn('[Conversations] decrypt: no wrappingKey available');
  }

  if (deviceId && wrappingKey) {
    try {
      const storedKeys = await getDeviceKeysForIdentity(identityId);
      if (storedKeys.length === 0) {
        console.warn('[Conversations] decrypt: no stored device keys for identity', identityId);
      }
      const myDeviceKeys = storedKeys.find((k) => k.deviceId === deviceId);
      if (!myDeviceKeys) {
        console.warn(
          '[Conversations] decrypt: no stored key matches deviceId',
          deviceId,
          'available:',
          storedKeys.map((k) => k.deviceId)
        );
      } else {
        const decrypted = await decryptDeviceKeys(myDeviceKeys, wrappingKey);
        ecdhPrivateKey = decrypted.ecdhPrivateKey;
        kemPrivateKey = decrypted.kemPrivateKey;
        myRoutingTag = decrypted.routingTag;
      }
    } catch (err) {
      console.error('[Conversations] decrypt: failed to load device keys:', err);
    }
  }

  return { ecdhPrivateKey, kemPrivateKey, myRoutingTag };
}

/**
 * Matches legacy `fetchMessagesAround` / `ensureReplyParentHydration` device-key loading.
 */
export async function loadDecryptKeysQuiet(
  identityId: string,
  deviceId: string | null,
  wrappingKey: Uint8Array | null
): Promise<LoadedDecryptKeys> {
  let ecdhPrivateKey: Uint8Array | null = null;
  let kemPrivateKey: Uint8Array | null = null;
  let myRoutingTag: string | undefined;

  if (deviceId && wrappingKey) {
    try {
      const storedKeys = await getDeviceKeysForIdentity(identityId);
      const myDeviceKeys = storedKeys.find((k) => k.deviceId === deviceId);
      if (myDeviceKeys) {
        const decrypted = await decryptDeviceKeys(myDeviceKeys, wrappingKey);
        ecdhPrivateKey = decrypted.ecdhPrivateKey;
        kemPrivateKey = decrypted.kemPrivateKey;
        myRoutingTag = decrypted.routingTag;
      }
    } catch (err) {
      console.error('[Conversations] decrypt: failed to load device keys:', err);
    }
  }

  return { ecdhPrivateKey, kemPrivateKey, myRoutingTag };
}

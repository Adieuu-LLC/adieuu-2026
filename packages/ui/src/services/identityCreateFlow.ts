import {
  DEFAULT_MAX_REQUEST_BODY_BYTES,
  jsonUtf8ByteLength,
  type createApiClient,
  type PublicIdentity,
} from '@adieuu/shared';
import {
  clearBytes,
  deriveEntropyWrappingKey,
  getSigningPublicKey,
  toBase64,
} from '@adieuu/crypto';
import {
  generateE2EKeys,
  getDefaultDeviceName,
} from './e2eKeyService';
import { getOrCreateWrappingSalt, storeDeviceKeys } from './deviceKeyStorage';
import { generateAndUploadPreKeys } from './preKeyService';
import type { CreateIdentityResult } from '../hooks/useIdentity.types';

type ApiClient = ReturnType<typeof createApiClient>;

export interface CreateIdentityFlowSuccess {
  ok: true;
  identity: PublicIdentity;
  wrappingKey: Uint8Array;
  wrappingSalt: Uint8Array;
  signingPrivateKey: Uint8Array;
  deviceId: string;
}

export interface CreateIdentityFlowFailure {
  ok: false;
  result: CreateIdentityResult;
}

export type CreateIdentityFlowResult =
  | CreateIdentityFlowSuccess
  | CreateIdentityFlowFailure;

export async function runCreateIdentityFlow(
  api: ApiClient,
  platform: string,
  passphrase: string,
  username: string,
  displayName: string
): Promise<CreateIdentityFlowResult> {
  const response = await api.identity.create({ passphrase, username, displayName });
  if (!response.success) {
    const errorMessage = response.error?.message ?? 'Failed to create identity';
    let errorCode: CreateIdentityResult['errorCode'];
    if (errorMessage.includes('taken')) errorCode = 'USERNAME_TAKEN';
    else if (errorMessage.includes('maximum')) errorCode = 'MAX_IDENTITIES';
    else errorCode = 'VALIDATION_ERROR';
    return { ok: false, result: { success: false, error: errorMessage, errorCode } };
  }

  const createdIdentity = response.data;
  if (!createdIdentity) {
    return {
      ok: false,
      result: {
        success: false,
        error: 'Identity creation returned no data',
        errorCode: 'VALIDATION_ERROR',
      },
    };
  }

  let e2eResult: Awaited<ReturnType<typeof generateE2EKeys>>;
  try {
    e2eResult = await generateE2EKeys({
      identityId: createdIdentity.id,
      passphrase,
      deviceName: getDefaultDeviceName(),
      cryptoProfile: 'default',
    });
    console.log(
      '[Identity] createIdentity: SIGNING KEY DEBUG - public key to upload:',
      e2eResult.signingPublicKey
    );
    console.log(
      '[Identity] createIdentity: SIGNING KEY DEBUG - derived from private:',
      toBase64(getSigningPublicKey(e2eResult.signingPrivateKey))
    );
  } catch {
    return {
      ok: false,
      result: {
        success: false,
        error: 'Failed to generate encryption keys',
        errorCode: 'E2E_INIT_FAILED',
      },
    };
  }

  clearBytes(e2eResult.webDevice.privateKeys.ecdh);
  clearBytes(e2eResult.webDevice.privateKeys.kem);

  try {
    const sessionCheck = await api.identity.getSession();
    if (!sessionCheck.success || sessionCheck.data?.id !== createdIdentity.id) {
      clearBytes(e2eResult.signingPrivateKey);
      clearBytes(e2eResult.devicePrivateKeys.ecdh);
      clearBytes(e2eResult.devicePrivateKeys.kem);
      return {
        ok: false,
        result: {
          success: false,
          error: 'Identity session not established. Please try again.',
          errorCode: 'E2E_INIT_FAILED',
        },
      };
    }
  } catch {
    clearBytes(e2eResult.signingPrivateKey);
    clearBytes(e2eResult.devicePrivateKeys.ecdh);
    clearBytes(e2eResult.devicePrivateKeys.kem);
    return {
      ok: false,
      result: {
        success: false,
        error: 'Failed to verify identity session',
        errorCode: 'E2E_INIT_FAILED',
      },
    };
  }

  try {
    const initBody = {
      signingPublicKey: e2eResult.signingPublicKey,
      preferredCryptoProfile: 'default' as const,
      device: e2eResult.device,
      bundle: e2eResult.encryptedBundle,
    };
    const initBytes = jsonUtf8ByteLength(initBody);
    if (initBytes > DEFAULT_MAX_REQUEST_BODY_BYTES) {
      clearBytes(e2eResult.signingPrivateKey);
      clearBytes(e2eResult.devicePrivateKeys.ecdh);
      clearBytes(e2eResult.devicePrivateKeys.kem);
      return {
        ok: false,
        result: {
          success: false,
          error: `Encryption setup payload is too large (${(initBytes / 1024).toFixed(1)} KiB; max ${(DEFAULT_MAX_REQUEST_BODY_BYTES / 1024).toFixed(0)} KiB).`,
          errorCode: 'PAYLOAD_TOO_LARGE',
        },
      };
    }
    const initResponse = await api.identity.initializeE2E(createdIdentity.id, initBody);
    if (!initResponse.success) {
      clearBytes(e2eResult.signingPrivateKey);
      clearBytes(e2eResult.devicePrivateKeys.ecdh);
      clearBytes(e2eResult.devicePrivateKeys.kem);
      return {
        ok: false,
        result: {
          success: false,
          error: 'Failed to upload encryption keys to server',
          errorCode: 'E2E_INIT_FAILED',
        },
      };
    }
  } catch {
    clearBytes(e2eResult.signingPrivateKey);
    clearBytes(e2eResult.devicePrivateKeys.ecdh);
    clearBytes(e2eResult.devicePrivateKeys.kem);
    return {
      ok: false,
      result: {
        success: false,
        error: 'Failed to initialize encryption',
        errorCode: 'E2E_INIT_FAILED',
      },
    };
  }

  let wrappingKey: Uint8Array;
  let wrappingSalt: Uint8Array;
  try {
    wrappingSalt = await getOrCreateWrappingSalt(createdIdentity.id);
    wrappingKey = await deriveEntropyWrappingKey(passphrase, wrappingSalt);
  } catch {
    clearBytes(e2eResult.signingPrivateKey);
    clearBytes(e2eResult.devicePrivateKeys.ecdh);
    clearBytes(e2eResult.devicePrivateKeys.kem);
    return {
      ok: false,
      result: {
        success: false,
        error: 'Failed to derive wrapping key',
        errorCode: 'E2E_INIT_FAILED',
      },
    };
  }

  try {
    await storeDeviceKeys(
      e2eResult.device.deviceId,
      createdIdentity.id,
      e2eResult.devicePrivateKeys.ecdh,
      e2eResult.devicePrivateKeys.kem,
      wrappingKey,
      e2eResult.device.routingTag
    );
  } catch {
    clearBytes(wrappingKey);
    clearBytes(e2eResult.signingPrivateKey);
    return {
      ok: false,
      result: {
        success: false,
        error: 'Failed to store device keys',
        errorCode: 'E2E_INIT_FAILED',
      },
    };
  }

  try {
    await generateAndUploadPreKeys(
      {
        identityId: createdIdentity.id,
        deviceId: e2eResult.device.deviceId,
        signingPrivateKey: e2eResult.signingPrivateKey,
        wrappingKey,
        platform: platform as never,
      },
      api.identity
    );
  } catch {
    // Non-fatal.
  }

  return {
    ok: true,
    identity: createdIdentity,
    wrappingKey,
    wrappingSalt,
    signingPrivateKey: e2eResult.signingPrivateKey,
    deviceId: e2eResult.device.deviceId,
  };
}

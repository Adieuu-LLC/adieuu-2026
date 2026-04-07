import { deriveEntropyWrappingKey } from '@adieuu/crypto';
import { getOrCreateWrappingSalt } from './deviceKeyStorage';
import type { UnlockIdentityResult } from '../hooks/useIdentity.types';

export async function deriveUnlockWrappingKey(
  identityId: string,
  passphrase: string
): Promise<
  | { ok: true; wrappingKey: Uint8Array; salt: Uint8Array }
  | { ok: false; result: UnlockIdentityResult }
> {
  try {
    const salt = await getOrCreateWrappingSalt(identityId);
    const wrappingKey = await deriveEntropyWrappingKey(passphrase, salt);
    return { ok: true, wrappingKey, salt };
  } catch {
    return {
      ok: false,
      result: {
        success: false,
        error: 'Invalid passphrase',
        errorCode: 'INVALID_PASSPHRASE',
      },
    };
  }
}

/**
 * Identity Encrypted Preferences repository.
 * Data access layer for E2E-encrypted identity preferences.
 *
 * @module repositories/identity-preferences
 */

import { getCollection, Collections } from '../db';
import { withTimestamps } from '../models/base';
import type {
  IdentityEncryptedPrefsDocument,
  CreateIdentityPrefsInput,
  UpdateIdentityPrefsInput,
} from '../models/identity-preferences';

export class IdentityPreferencesRepository {
  private get collection() {
    return getCollection<IdentityEncryptedPrefsDocument>(Collections.IDENTITY_ENCRYPTED_PREFS);
  }

  async findByPrefsId(prefsId: string): Promise<IdentityEncryptedPrefsDocument | null> {
    return this.collection.findOne({ prefsId });
  }

  async upsert(prefsId: string, input: CreateIdentityPrefsInput | UpdateIdentityPrefsInput): Promise<IdentityEncryptedPrefsDocument> {
    const now = new Date();

    const result = await this.collection.findOneAndUpdate(
      { prefsId },
      {
        $set: { ...input, prefsId, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: 'after' },
    );

    return result!;
  }

  async deleteByPrefsId(prefsId: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ prefsId });
    return result.deletedCount > 0;
  }
}

let instance: IdentityPreferencesRepository | null = null;

export function getIdentityPreferencesRepository(): IdentityPreferencesRepository {
  if (!instance) instance = new IdentityPreferencesRepository();
  return instance;
}

/**
 * Key Bundle Repository
 *
 * Data access layer for encrypted signing key bundle operations.
 * Bundles are stored with obfuscated IDs to prevent linking to identities.
 *
 * SECURITY NOTES:
 * - Bundle ID is derived from identity's ident hash (server-side only)
 * - Never log or expose the relationship between bundle ID and identity
 * - All bundle contents are encrypted client-side
 *
 * @module repositories/key-bundle
 */

import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  KeyBundleDocument,
  CreateKeyBundleInput,
} from '../models/key-bundle';
import { CURRENT_KEY_BUNDLE_SCHEME_VERSION } from '../models/key-bundle';

/**
 * Key bundle repository interface
 */
export interface IKeyBundleRepository {
  findByBundleId(bundleId: string): Promise<KeyBundleDocument | null>;
  create(input: CreateKeyBundleInput): Promise<KeyBundleDocument>;
  updateBundle(
    bundleId: string,
    encryptedBundle: string,
    salt: string,
    nonce: string
  ): Promise<KeyBundleDocument | null>;
  deleteByBundleId(bundleId: string): Promise<boolean>;
  exists(bundleId: string): Promise<boolean>;
}

/**
 * Key bundle repository implementation
 */
export class KeyBundleRepository
  extends BaseRepository<KeyBundleDocument>
  implements IKeyBundleRepository
{
  constructor() {
    super(Collections.KEY_BUNDLES);
  }

  /**
   * Find a key bundle by its derived bundle ID.
   */
  async findByBundleId(bundleId: string): Promise<KeyBundleDocument | null> {
    return await this.findOne({ bundleId });
  }

  /**
   * Create a new key bundle.
   */
  async create(input: CreateKeyBundleInput): Promise<KeyBundleDocument> {
    const doc: Omit<KeyBundleDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      bundleId: input.bundleId,
      encryptedBundle: input.encryptedBundle,
      salt: input.salt,
      nonce: input.nonce,
      useSeparatePassphrase: input.useSeparatePassphrase,
      schemeVersion: input.schemeVersion ?? CURRENT_KEY_BUNDLE_SCHEME_VERSION,
    };

    return await super.create(doc);
  }

  /**
   * Update an existing bundle's encrypted content.
   * Used when rotating the encryption or changing passphrase.
   */
  async updateBundle(
    bundleId: string,
    encryptedBundle: string,
    salt: string,
    nonce: string
  ): Promise<KeyBundleDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { bundleId },
      {
        $set: {
          encryptedBundle,
          salt,
          nonce,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    return result as KeyBundleDocument | null;
  }

  /**
   * Migrate a bundle to a new bundleId and update its encrypted contents.
   * Used during passphrase change when the ident (and thus bundleId) changes.
   */
  async migrateBundleId(
    oldBundleId: string,
    newBundleId: string,
    encryptedBundle: string,
    salt: string,
    nonce: string,
  ): Promise<KeyBundleDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { bundleId: oldBundleId },
      {
        $set: {
          bundleId: newBundleId,
          encryptedBundle,
          salt,
          nonce,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );

    return result as KeyBundleDocument | null;
  }

  /**
   * Delete a key bundle by its bundle ID.
   * Used when deleting an identity.
   */
  async deleteByBundleId(bundleId: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ bundleId });
    return result.deletedCount === 1;
  }

  /**
   * Check if a bundle exists for the given bundle ID.
   */
  async exists(bundleId: string): Promise<boolean> {
    const count = await this.collection.countDocuments({ bundleId }, { limit: 1 });
    return count > 0;
  }
}

// Singleton instance
let keyBundleRepository: KeyBundleRepository | null = null;

/**
 * Get the key bundle repository instance.
 */
export function getKeyBundleRepository(): KeyBundleRepository {
  if (!keyBundleRepository) {
    keyBundleRepository = new KeyBundleRepository();
  }
  return keyBundleRepository;
}

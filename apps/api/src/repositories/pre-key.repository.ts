/**
 * Pre-Key Repository
 *
 * Handles storage and retrieval of signed and one-time pre-keys
 * for forward secrecy in DM encryption.
 *
 * Key operations:
 * - Upload signed pre-keys and one-time pre-key batches
 * - Atomically claim (consume) one-time pre-keys for senders
 * - Query active signed pre-keys and remaining OTPK counts
 *
 * @module repositories/pre-key
 */

import { type Filter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import { withTimestamps } from '../models/base';
import type {
  PreKeyDocument,
  CreateSignedPreKeyInput,
  CreateOneTimePreKeyInput,
  PublicSignedPreKey,
  PublicOneTimePreKey,
  ClaimedDevicePreKeys,
} from '../models/pre-key';
import { CONSUMED_OTPK_TTL_DAYS } from '../models/pre-key';

export interface IPreKeyRepository {
  storeSignedPreKey(input: CreateSignedPreKeyInput): Promise<PreKeyDocument>;
  storeOneTimePreKeys(inputs: CreateOneTimePreKeyInput[]): Promise<number>;
  getActiveSignedPreKey(identityId: string | ObjectId, deviceId: string): Promise<PreKeyDocument | null>;
  claimOneTimePreKey(identityId: string | ObjectId, deviceId: string): Promise<PreKeyDocument | null>;
  claimPreKeysForAllDevices(identityId: string | ObjectId, deviceIds: string[]): Promise<ClaimedDevicePreKeys[]>;
  countUnconsumedOneTimePreKeys(identityId: string | ObjectId, deviceId: string): Promise<number>;
  purgeUnconsumedOneTimePreKeys(identityId: string | ObjectId, deviceId: string): Promise<number>;
  deletePreKeysForDevice(identityId: string | ObjectId, deviceId: string): Promise<number>;
  deleteAllPreKeysForIdentity(identityId: string | ObjectId): Promise<number>;
}

export class PreKeyRepository extends BaseRepository<PreKeyDocument> implements IPreKeyRepository {
  constructor() {
    super(Collections.PRE_KEYS);
  }

  /**
   * Store a signed pre-key for a device.
   * Replaces any existing active signed pre-key for the device.
   */
  async storeSignedPreKey(input: CreateSignedPreKeyInput): Promise<PreKeyDocument> {
    const identityId = this.toObjectId(input.identityId);

    // Mark any existing signed pre-keys for this device as expired
    await this.collection.updateMany(
      {
        identityId,
        deviceId: input.deviceId,
        keyType: 'signed',
      } as Filter<PreKeyDocument>,
      {
        $set: { expiresAt: new Date() },
      }
    );

    return await this.create({
      identityId,
      deviceId: input.deviceId,
      keyType: 'signed',
      keyId: input.keyId,
      ecdhPublicKey: input.ecdhPublicKey,
      kemPublicKey: input.kemPublicKey,
      signature: input.signature,
      consumed: false,
      expiresAt: input.expiresAt,
    } as Omit<PreKeyDocument, '_id' | 'createdAt' | 'updatedAt'>);
  }

  /**
   * Store a batch of one-time pre-keys for a device.
   * Returns the number of keys successfully inserted.
   */
  async storeOneTimePreKeys(inputs: CreateOneTimePreKeyInput[]): Promise<number> {
    if (inputs.length === 0) return 0;

    const docs = inputs.map((input) =>
      withTimestamps({
        identityId: this.toObjectId(input.identityId),
        deviceId: input.deviceId,
        keyType: 'one-time' as const,
        keyId: input.keyId,
        ecdhPublicKey: input.ecdhPublicKey,
        kemPublicKey: input.kemPublicKey,
        consumed: false,
      })
    );

    const result = await this.collection.insertMany(docs as PreKeyDocument[]);
    return result.insertedCount;
  }

  /**
   * Get the active (non-expired) signed pre-key for a device.
   */
  async getActiveSignedPreKey(
    identityId: string | ObjectId,
    deviceId: string
  ): Promise<PreKeyDocument | null> {
    const objectId = this.toObjectId(identityId);
    return await this.collection.findOne({
      identityId: objectId,
      deviceId,
      keyType: 'signed',
      expiresAt: { $gt: new Date() },
    } as Filter<PreKeyDocument>);
  }

  /**
   * Atomically claim (consume) one unconsumed one-time pre-key for a device.
   * Returns null if no unconsumed OTPKs are available.
   *
   * Uses findOneAndUpdate with { consumed: false } to ensure atomicity --
   * two concurrent senders will never receive the same OTPK.
   */
  async claimOneTimePreKey(
    identityId: string | ObjectId,
    deviceId: string
  ): Promise<PreKeyDocument | null> {
    const objectId = this.toObjectId(identityId);
    const now = new Date();
    const cleanupAt = new Date(now.getTime() + CONSUMED_OTPK_TTL_DAYS * 24 * 60 * 60 * 1000);

    const result = await this.collection.findOneAndUpdate(
      {
        identityId: objectId,
        deviceId,
        keyType: 'one-time',
        consumed: false,
      } as Filter<PreKeyDocument>,
      {
        $set: {
          consumed: true,
          consumedAt: now,
          expiresAt: cleanupAt,
        },
      },
      { returnDocument: 'before' }
    );

    return result as PreKeyDocument | null;
  }

  /**
   * Claim pre-keys for all specified devices of an identity.
   * For each device, returns the active signed pre-key and one consumed OTPK.
   */
  async claimPreKeysForAllDevices(
    identityId: string | ObjectId,
    deviceIds: string[]
  ): Promise<ClaimedDevicePreKeys[]> {
    const results = await Promise.all(
      deviceIds.map(async (deviceId) => {
        const [signedPreKey, oneTimePreKey] = await Promise.all([
          this.getActiveSignedPreKey(identityId, deviceId),
          this.claimOneTimePreKey(identityId, deviceId),
        ]);

        let publicSignedPreKey: PublicSignedPreKey | null = null;
        if (signedPreKey?.signature) {
          publicSignedPreKey = {
            keyId: signedPreKey.keyId,
            ecdhPublicKey: signedPreKey.ecdhPublicKey,
            kemPublicKey: signedPreKey.kemPublicKey,
            signature: signedPreKey.signature,
          };
        }

        let publicOneTimePreKey: PublicOneTimePreKey | null = null;
        if (oneTimePreKey) {
          publicOneTimePreKey = {
            keyId: oneTimePreKey.keyId,
            ecdhPublicKey: oneTimePreKey.ecdhPublicKey,
            kemPublicKey: oneTimePreKey.kemPublicKey,
          };
        }

        return {
          deviceId,
          signedPreKey: publicSignedPreKey,
          oneTimePreKey: publicOneTimePreKey,
        };
      })
    );

    return results;
  }

  /**
   * Count unconsumed one-time pre-keys for a device.
   */
  async countUnconsumedOneTimePreKeys(
    identityId: string | ObjectId,
    deviceId: string
  ): Promise<number> {
    const objectId = this.toObjectId(identityId);
    return await this.collection.countDocuments({
      identityId: objectId,
      deviceId,
      keyType: 'one-time',
      consumed: false,
    } as Filter<PreKeyDocument>);
  }

  /**
   * Delete all unconsumed one-time pre-keys for a device.
   * Used to reset the OTPK pool when local and server state have diverged.
   */
  async purgeUnconsumedOneTimePreKeys(
    identityId: string | ObjectId,
    deviceId: string
  ): Promise<number> {
    const objectId = this.toObjectId(identityId);
    const result = await this.collection.deleteMany({
      identityId: objectId,
      deviceId,
      keyType: 'one-time',
      consumed: false,
    } as Filter<PreKeyDocument>);
    return result.deletedCount;
  }

  /**
   * Delete all pre-keys for a specific device (used when device is removed).
   */
  async deletePreKeysForDevice(
    identityId: string | ObjectId,
    deviceId: string
  ): Promise<number> {
    const objectId = this.toObjectId(identityId);
    const result = await this.collection.deleteMany({
      identityId: objectId,
      deviceId,
    } as Filter<PreKeyDocument>);
    return result.deletedCount;
  }

  /**
   * Delete all pre-keys for an identity (used when identity is deleted).
   */
  async deleteAllPreKeysForIdentity(identityId: string | ObjectId): Promise<number> {
    const objectId = this.toObjectId(identityId);
    const result = await this.collection.deleteMany({
      identityId: objectId,
    } as Filter<PreKeyDocument>);
    return result.deletedCount;
  }
}

let preKeyRepository: PreKeyRepository | null = null;

export function getPreKeyRepository(): PreKeyRepository {
  if (!preKeyRepository) {
    preKeyRepository = new PreKeyRepository();
  }
  return preKeyRepository;
}

/**
 * Identity Backup Codes Repository
 *
 * Data access layer for identity-scoped recovery codes.
 * Follows the same replace-on-regenerate pattern as the MFA backup codes
 * repository, but keyed by identityId instead of userId.
 *
 * @module repositories/identity-backup-codes
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  IdentityBackupCodesDocument,
  CreateIdentityBackupCodesInput,
} from '../models/identity-backup-codes';

export interface IIdentityBackupCodesRepository {
  findByIdentityId(identityId: string | ObjectId): Promise<IdentityBackupCodesDocument | null>;
  create(input: CreateIdentityBackupCodesInput): Promise<IdentityBackupCodesDocument>;
  updateCodes(identityId: string | ObjectId, hashedCodes: string[]): Promise<void>;
  deleteByIdentityId(identityId: string | ObjectId): Promise<boolean>;
}

export class IdentityBackupCodesRepository
  extends BaseRepository<IdentityBackupCodesDocument>
  implements IIdentityBackupCodesRepository
{
  constructor() {
    super(Collections.IDENTITY_BACKUP_CODES);
  }

  async findByIdentityId(identityId: string | ObjectId): Promise<IdentityBackupCodesDocument | null> {
    const objectId = this.toObjectId(identityId);
    return await this.findOne({ identityId: objectId });
  }

  async create(input: CreateIdentityBackupCodesInput): Promise<IdentityBackupCodesDocument> {
    const objectId = this.toObjectId(input.identityId);

    const doc: Omit<IdentityBackupCodesDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      identityId: objectId,
      hashedCodes: input.hashedCodes,
      totalGenerated: input.totalGenerated,
      generatedAt: new Date(),
    };

    // Replace any existing codes for this identity
    await this.collection.deleteMany({ identityId: objectId });

    return await super.create(doc);
  }

  async updateCodes(identityId: string | ObjectId, hashedCodes: string[]): Promise<void> {
    const objectId = this.toObjectId(identityId);
    await this.collection.updateOne(
      { identityId: objectId },
      { $set: { hashedCodes, updatedAt: new Date() } },
    );
  }

  async deleteByIdentityId(identityId: string | ObjectId): Promise<boolean> {
    const objectId = this.toObjectId(identityId);
    const result = await this.collection.deleteMany({ identityId: objectId });
    return result.deletedCount > 0;
  }
}

// Singleton instance
let identityBackupCodesRepository: IdentityBackupCodesRepository | null = null;

export function getIdentityBackupCodesRepository(): IdentityBackupCodesRepository {
  if (!identityBackupCodesRepository) {
    identityBackupCodesRepository = new IdentityBackupCodesRepository();
  }
  return identityBackupCodesRepository;
}

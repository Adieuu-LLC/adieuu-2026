/**
 * MFA repositories
 * Data access layer for TOTP, WebAuthn, and backup codes
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  TotpCredentialDocument,
  CreateTotpInput,
  WebAuthnCredentialDocument,
  CreateWebAuthnInput,
  MfaBackupCodesDocument,
  CreateBackupCodesInput,
} from '../models/mfa';

// ============================================================================
// TOTP Repository
// ============================================================================

export interface ITotpRepository {
  findById(id: string | ObjectId): Promise<TotpCredentialDocument | null>;
  findByUserId(userId: string | ObjectId): Promise<TotpCredentialDocument[]>;
  findVerifiedByUserId(userId: string | ObjectId): Promise<TotpCredentialDocument[]>;
  create(input: CreateTotpInput): Promise<TotpCredentialDocument>;
  verify(id: string | ObjectId): Promise<TotpCredentialDocument | null>;
  updateLastUsed(id: string | ObjectId): Promise<void>;
  delete(id: string | ObjectId): Promise<boolean>;
  deleteAllForUser(userId: string | ObjectId): Promise<number>;
}

export class TotpRepository
  extends BaseRepository<TotpCredentialDocument>
  implements ITotpRepository
{
  constructor() {
    super(Collections.TOTP_CREDENTIALS);
  }

  async findByUserId(userId: string | ObjectId): Promise<TotpCredentialDocument[]> {
    const objectId = this.toObjectId(userId);
    return await this.findMany({ userId: objectId });
  }

  async findVerifiedByUserId(userId: string | ObjectId): Promise<TotpCredentialDocument[]> {
    const objectId = this.toObjectId(userId);
    return await this.findMany({ userId: objectId, verified: true });
  }

  async create(input: CreateTotpInput): Promise<TotpCredentialDocument> {
    const doc: Omit<TotpCredentialDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      userId: input.userId,
      encryptedSecret: input.encryptedSecret,
      name: input.name,
      verified: false,
    };
    return await super.create(doc);
  }

  async verify(id: string | ObjectId): Promise<TotpCredentialDocument | null> {
    return await this.updateById(id, {
      verified: true,
      verifiedAt: new Date(),
    });
  }

  async updateLastUsed(id: string | ObjectId): Promise<void> {
    await this.updateById(id, { lastUsedAt: new Date() });
  }

  async delete(id: string | ObjectId): Promise<boolean> {
    return await this.deleteById(id);
  }

  async deleteAllForUser(userId: string | ObjectId): Promise<number> {
    const objectId = this.toObjectId(userId);
    const result = await this.collection.deleteMany({ userId: objectId });
    return result.deletedCount;
  }
}

// ============================================================================
// WebAuthn Repository
// ============================================================================

export interface IWebAuthnRepository {
  findById(id: string | ObjectId): Promise<WebAuthnCredentialDocument | null>;
  findByCredentialId(credentialId: string): Promise<WebAuthnCredentialDocument | null>;
  findByUserId(userId: string | ObjectId): Promise<WebAuthnCredentialDocument[]>;
  create(input: CreateWebAuthnInput): Promise<WebAuthnCredentialDocument>;
  updateCounter(id: string | ObjectId, counter: number): Promise<void>;
  updateLastUsed(id: string | ObjectId): Promise<void>;
  rename(id: string | ObjectId, name: string): Promise<WebAuthnCredentialDocument | null>;
  delete(id: string | ObjectId): Promise<boolean>;
  deleteAllForUser(userId: string | ObjectId): Promise<number>;
}

export class WebAuthnRepository
  extends BaseRepository<WebAuthnCredentialDocument>
  implements IWebAuthnRepository
{
  constructor() {
    super(Collections.WEBAUTHN_CREDENTIALS);
  }

  async findByCredentialId(credentialId: string): Promise<WebAuthnCredentialDocument | null> {
    return await this.findOne({ credentialId });
  }

  async findByUserId(userId: string | ObjectId): Promise<WebAuthnCredentialDocument[]> {
    const objectId = this.toObjectId(userId);
    return await this.findMany({ userId: objectId });
  }

  async create(input: CreateWebAuthnInput): Promise<WebAuthnCredentialDocument> {
    const doc: Omit<WebAuthnCredentialDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      userId: input.userId,
      credentialId: input.credentialId,
      publicKey: input.publicKey,
      counter: input.counter,
      deviceType: input.deviceType,
      backedUp: input.backedUp,
      transports: input.transports,
      name: input.name,
      aaguid: input.aaguid,
    };
    return await super.create(doc);
  }

  async updateCounter(id: string | ObjectId, counter: number): Promise<void> {
    await this.updateById(id, { counter, lastUsedAt: new Date() });
  }

  async updateLastUsed(id: string | ObjectId): Promise<void> {
    await this.updateById(id, { lastUsedAt: new Date() });
  }

  async rename(id: string | ObjectId, name: string): Promise<WebAuthnCredentialDocument | null> {
    return await this.updateById(id, { name });
  }

  async delete(id: string | ObjectId): Promise<boolean> {
    return await this.deleteById(id);
  }

  async deleteAllForUser(userId: string | ObjectId): Promise<number> {
    const objectId = this.toObjectId(userId);
    const result = await this.collection.deleteMany({ userId: objectId });
    return result.deletedCount;
  }
}

// ============================================================================
// Backup Codes Repository
// ============================================================================

export interface IBackupCodesRepository {
  findByUserId(userId: string | ObjectId): Promise<MfaBackupCodesDocument | null>;
  create(input: CreateBackupCodesInput): Promise<MfaBackupCodesDocument>;
  updateCodes(userId: string | ObjectId, hashedCodes: string[]): Promise<void>;
  deleteForUser(userId: string | ObjectId): Promise<boolean>;
}

export class BackupCodesRepository
  extends BaseRepository<MfaBackupCodesDocument>
  implements IBackupCodesRepository
{
  constructor() {
    super(Collections.MFA_BACKUP_CODES);
  }

  async findByUserId(userId: string | ObjectId): Promise<MfaBackupCodesDocument | null> {
    const objectId = this.toObjectId(userId);
    return await this.findOne({ userId: objectId });
  }

  async create(input: CreateBackupCodesInput): Promise<MfaBackupCodesDocument> {
    const objectId = this.toObjectId(input.userId);
    
    // Upsert - replace existing backup codes for this user
    const doc: Omit<MfaBackupCodesDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      userId: objectId,
      hashedCodes: input.hashedCodes,
      totalGenerated: input.totalGenerated,
      generatedAt: new Date(),
    };

    // Delete existing codes first (if any)
    await this.collection.deleteMany({ userId: objectId });
    
    return await super.create(doc);
  }

  async updateCodes(userId: string | ObjectId, hashedCodes: string[]): Promise<void> {
    const objectId = this.toObjectId(userId);
    await this.collection.updateOne(
      { userId: objectId },
      { $set: { hashedCodes, updatedAt: new Date() } }
    );
  }

  async deleteForUser(userId: string | ObjectId): Promise<boolean> {
    const objectId = this.toObjectId(userId);
    const result = await this.collection.deleteMany({ userId: objectId });
    return result.deletedCount > 0;
  }
}

// ============================================================================
// Singleton Instances
// ============================================================================

let totpRepository: TotpRepository | null = null;
let webauthnRepository: WebAuthnRepository | null = null;
let backupCodesRepository: BackupCodesRepository | null = null;

export function getTotpRepository(): TotpRepository {
  if (!totpRepository) {
    totpRepository = new TotpRepository();
  }
  return totpRepository;
}

export function getWebAuthnRepository(): WebAuthnRepository {
  if (!webauthnRepository) {
    webauthnRepository = new WebAuthnRepository();
  }
  return webauthnRepository;
}

export function getBackupCodesRepository(): BackupCodesRepository {
  if (!backupCodesRepository) {
    backupCodesRepository = new BackupCodesRepository();
  }
  return backupCodesRepository;
}

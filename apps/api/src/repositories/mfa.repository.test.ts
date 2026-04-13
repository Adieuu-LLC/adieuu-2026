import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

mock.module('../config', () => ({
  config: {
    env: 'test',
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
  },
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

function createMockCollection() {
  return {
    findOne: mock(() => Promise.resolve(null)) as AnyMock,
    find: mock(() => ({
      limit: mock(() => ({
        toArray: mock(() => Promise.resolve([])),
      })),
      toArray: mock(() => Promise.resolve([])),
    })) as AnyMock,
    insertOne: mock(() => Promise.resolve({ insertedId: new ObjectId() })) as AnyMock,
    findOneAndUpdate: mock(() => Promise.resolve(null)) as AnyMock,
    deleteOne: mock(() => Promise.resolve({ deletedCount: 1 })) as AnyMock,
    deleteMany: mock(() => Promise.resolve({ deletedCount: 0 })) as AnyMock,
    updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })) as AnyMock,
  };
}

const mockTotpCollection = createMockCollection();
const mockWebAuthnCollection = createMockCollection();
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../db', () => ({
  getCollection: mock((name: string) => {
    if (name === 'totp_credentials') return mockTotpCollection;
    if (name === 'webauthn_credentials') return mockWebAuthnCollection;
    throw new Error(`Unexpected collection: ${name}`);
  }),
  Collections: {
    TOTP_CREDENTIALS: 'totp_credentials',
    WEBAUTHN_CREDENTIALS: 'webauthn_credentials',
  },
}));

import {
  TotpRepository,
  WebAuthnRepository,
} from './mfa.repository';

describe('mfa.repository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    for (const col of [mockTotpCollection, mockWebAuthnCollection]) {
      col.findOne.mockReset();
      col.find.mockReset();
      col.insertOne.mockReset();
      col.findOneAndUpdate.mockReset();
      col.deleteOne.mockReset();
      col.deleteMany.mockReset();
      col.updateOne.mockReset();

      col.findOne.mockResolvedValue(null);
      col.find.mockImplementation(() => ({
        limit: () => ({
          toArray: async () => [],
        }),
        toArray: async () => [],
      }));
      col.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
      col.findOneAndUpdate.mockResolvedValue(null);
      col.deleteOne.mockResolvedValue({ deletedCount: 1 });
      col.deleteMany.mockResolvedValue({ deletedCount: 0 });
      col.updateOne.mockResolvedValue({ modifiedCount: 1 });
    }
  });

  test('TotpRepository.create sets verified=false and stores encrypted secret', async () => {
    const repo = new TotpRepository();
    const userId = new ObjectId();

    await repo.create({
      userId,
      encryptedSecret: 'enc:secret',
      name: 'Authenticator',
    });

    expect(mockTotpCollection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        encryptedSecret: 'enc:secret',
        name: 'Authenticator',
        verified: false,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
      { session: undefined }
    );
  });

  test('TotpRepository.verify marks credential verified with timestamp', async () => {
    const repo = new TotpRepository();
    await repo.verify(new ObjectId());

    expect(mockTotpCollection.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.any(ObjectId) }),
      expect.objectContaining({
        $set: expect.objectContaining({
          verified: true,
          verifiedAt: expect.any(Date),
        }),
      }),
      { returnDocument: 'after' }
    );
  });

  test('WebAuthnRepository.findByCredentialId queries by credentialId', async () => {
    const repo = new WebAuthnRepository();
    await repo.findByCredentialId('cred-id-1');
    expect(mockWebAuthnCollection.findOne).toHaveBeenCalledWith({ credentialId: 'cred-id-1' });
  });
});

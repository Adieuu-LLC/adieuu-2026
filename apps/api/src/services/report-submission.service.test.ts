import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const messageRepoMock = {
  findById: mock(() => Promise.resolve(null)) as AnyMock,
  findBefore: mock(() => Promise.resolve([])) as AnyMock,
  findAfter: mock(() => Promise.resolve([])) as AnyMock,
};
const conversationRepoMock = {
  findById: mock(() => Promise.resolve(null)) as AnyMock,
};
const identityRepoMock = {
  findByIdentityId: mock(() => Promise.resolve(null)) as AnyMock,
};
const reportRepoMock = {
  findByIdempotencyKey: mock(() => Promise.resolve(null)) as AnyMock,
  createReport: mock(() => Promise.resolve({ _id: new ObjectId() })) as AnyMock,
};

mock.module('../repositories/message.repository', () => ({
  getMessageRepository: () => messageRepoMock,
}));
mock.module('../repositories/conversation.repository', () => ({
  getConversationRepository: () => conversationRepoMock,
}));
mock.module('../repositories/identity.repository', () => ({
  getIdentityRepository: () => identityRepoMock,
}));
mock.module('../repositories/report.repository', () => ({
  getReportRepository: () => reportRepoMock,
}));

import { submitMessageReport } from './report-submission.service';

describe('report-submission.service', () => {
  const reporterIdentityId = new ObjectId().toHexString();
  const targetMessageId = new ObjectId().toHexString();
  const conversationId = new ObjectId();
  const senderIdentityId = new ObjectId();
  const targetMessage = {
    _id: new ObjectId(targetMessageId),
    conversationId,
    fromIdentityId: senderIdentityId,
    ciphertext: Buffer.from('cipher').toString('base64'),
    nonce: Buffer.from('nonce').toString('base64'),
    signature: Buffer.from('sig').toString('base64'),
    wrappedKeys: [],
    cryptoProfile: 'default',
    deletedForEveryone: false,
    messageType: 'text',
    createdAt: new Date(),
  };

  beforeEach(() => {
    messageRepoMock.findById.mockReset();
    messageRepoMock.findBefore.mockReset();
    messageRepoMock.findAfter.mockReset();
    conversationRepoMock.findById.mockReset();
    identityRepoMock.findByIdentityId.mockReset();
    reportRepoMock.findByIdempotencyKey.mockReset();
    reportRepoMock.createReport.mockReset();

    messageRepoMock.findById.mockImplementation(() => Promise.resolve(targetMessage));
    messageRepoMock.findBefore.mockImplementation(() => Promise.resolve([]));
    messageRepoMock.findAfter.mockImplementation(() => Promise.resolve([]));
    conversationRepoMock.findById.mockImplementation(() =>
      Promise.resolve({
        _id: conversationId,
        participants: [new ObjectId(reporterIdentityId), senderIdentityId],
      })
    );
    identityRepoMock.findByIdentityId.mockImplementation(() =>
      Promise.resolve({ signingPublicKey: Buffer.from('pub').toString('base64') })
    );
    reportRepoMock.findByIdempotencyKey.mockImplementation(() => Promise.resolve(null));
    reportRepoMock.createReport.mockImplementation(() =>
      Promise.resolve({ _id: new ObjectId() })
    );
  });

  test('returns DUPLICATE_REPORT when idempotency key already exists', async () => {
    reportRepoMock.findByIdempotencyKey.mockImplementation(() =>
      Promise.resolve({ _id: new ObjectId() })
    );

    const result = await submitMessageReport(reporterIdentityId, new ObjectId().toHexString(), {
      targetMessageId,
      category: 'spam',
      sessionKeys: {},
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('DUPLICATE_REPORT');
  });

  test('returns MISSING_SESSION_KEY when evidence key is absent', async () => {
    const result = await submitMessageReport(reporterIdentityId, new ObjectId().toHexString(), {
      targetMessageId,
      category: 'spam',
      sessionKeys: {},
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('MISSING_SESSION_KEY');
  });
});


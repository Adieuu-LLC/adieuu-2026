import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const mockFindOneAndUpdate = mock(() => Promise.resolve(null));
const mockUpdateMany = mock(() => Promise.resolve({ modifiedCount: 0 }));
const mockFindOne = mock(() => Promise.resolve(null));
const mockInsertOne = mock(() =>
  Promise.resolve({ insertedId: { toHexString: () => 'report-id-abc' } })
);
const mockUpdateOne = mock(() => Promise.resolve({ modifiedCount: 1 }));
const mockEstimatedDocumentCount = mock(() => Promise.resolve(100));
const mockCommand = mock(() => Promise.resolve({ ok: 1 }));

const mockE2eUpdateOne = mock(() => Promise.resolve({ matchedCount: 1 }));

function createMockCollection(name: string) {
  return {
    findOneAndUpdate: mockFindOneAndUpdate,
    updateMany: mockUpdateMany,
    updateOne: name === 'identities' ? mockUpdateOne : name === 'e2e_media' ? mockE2eUpdateOne : mock(() => Promise.resolve({ modifiedCount: 0 })),
    findOne: mockFindOne,
    insertOne: name === 'platform_reports' ? mockInsertOne : mock(() => Promise.resolve({ insertedId: null })),
    estimatedDocumentCount: mockEstimatedDocumentCount,
  };
}

const mockDb = {
  collection: mock((name: string) => createMockCollection(name)),
  command: mockCommand,
};

const mockMongoConnect = mock(() => Promise.resolve());

mock.module('mongodb', () => {
  class MockMongoClient {
    connect = mockMongoConnect;
    db = mock(() => mockDb);
  }
  class MockObjectId {
    _hex: string;
    constructor(hex?: string) {
      this._hex = hex ?? '000000000000000000000000';
    }
    toHexString() {
      return this._hex;
    }
  }
  return {
    MongoClient: MockMongoClient,
    ObjectId: MockObjectId,
  };
});

mock.module('./logging', () => ({
  logModerationEvent: mock(() => {}),
}));

import { handler } from './index';
import { logModerationEvent } from './logging';

afterAll(() => mock.restore());

const IDENTITY_HEX = 'aabbccddeeff00112233aabb';

function resetMocks(): void {
  mockFindOneAndUpdate.mockReset();
  mockUpdateMany.mockReset();
  mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });
  mockFindOne.mockReset();
  mockInsertOne.mockReset();
  mockUpdateOne.mockReset();
  mockE2eUpdateOne.mockReset();
  mockE2eUpdateOne.mockResolvedValue({ matchedCount: 1 });
  (logModerationEvent as ReturnType<typeof mock>).mockClear();
}

function mockMediaDoc(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    mediaId: 'media-123',
    identityId: IDENTITY_HEX,
    status: 'rejected',
    ...overrides,
  };
}

describe('handler basics', () => {
  beforeEach(resetMocks);

  test('rejects missing required fields', async () => {
    const result = await handler({ mediaId: '', status: '' as 'ready' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required fields');
  });

  test('returns error when media doc not found', async () => {
    mockFindOneAndUpdate.mockResolvedValue(null);
    const result = await handler({ mediaId: 'nonexistent', status: 'ready' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Upload not found');
  });

  test('updates media_uploads status on normal ready event', async () => {
    mockFindOneAndUpdate.mockResolvedValue(mockMediaDoc({ status: 'ready' }));
    const result = await handler({
      mediaId: 'media-123',
      status: 'ready',
      processedS3Key: 'processed/abc.webp',
    });
    expect(result.success).toBe(true);
  });
});

describe('CSAM rejection flow', () => {
  beforeEach(() => {
    resetMocks();
    mockFindOneAndUpdate.mockResolvedValue(mockMediaDoc());
    mockInsertOne.mockResolvedValue({
      insertedId: { toHexString: () => 'report-id-csam' },
    });
    mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  test('creates CSAM report with correct fields', async () => {
    mockFindOne
      .mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['ncmec'] })
      .mockResolvedValueOnce(null);

    const result = await handler({
      mediaId: 'media-123',
      status: 'rejected',
      rejectionReason: 'csam_hash_match: MD5:abc123',
      csamMatches: [
        {
          source: 'ncmec',
          hashType: 'MD5',
          matchedHash: 'abc123',
          matchType: 'exact',
          classification: 'csam',
        },
      ],
      evidenceBucket: 'evidence-bucket',
      evidenceKey: 'csam-evidence/media-123/image.jpg',
    });

    expect(result.success).toBe(true);
    expect(mockInsertOne).toHaveBeenCalled();

    const insertedDoc = mockInsertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertedDoc.source).toBe('automated_csam_hash');
    expect(insertedDoc.status).toBe('resolved');
    expect(insertedDoc.category).toBe('csam');
    expect(insertedDoc.tags).toContain('csam_detected');
    expect(insertedDoc.tags).toContain('automated');
    expect(insertedDoc.tags).toContain('source:ncmec');
  });

  test('bans identity with banned_csam entitlement', async () => {
    mockFindOne
      .mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['ncmec'] })
      .mockResolvedValueOnce(null);

    await handler({
      mediaId: 'media-123',
      status: 'rejected',
      csamMatches: [
        { source: 'ncmec', hashType: 'MD5', matchedHash: 'x', matchType: 'exact', classification: 'csam' },
      ],
      evidenceBucket: 'eb',
      evidenceKey: 'ek',
    });

    expect(mockUpdateOne).toHaveBeenCalled();
    const updateCall = mockUpdateOne.mock.calls[0] as unknown[];
    const filter = updateCall[0] as Record<string, unknown>;
    const update = updateCall[1] as Record<string, Record<string, unknown>>;

    expect(filter._id).toBeDefined();
    expect(update.$set).toMatchObject({ banned: true, bannedReason: 'csam_hash_match' });
    expect(update.$addToSet).toMatchObject({ entitlements: 'banned_csam' });
  });

  test('filters out matches from disabled services', async () => {
    mockFindOne
      .mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['ncmec'] });

    await handler({
      mediaId: 'media-123',
      status: 'rejected',
      csamMatches: [
        { source: 'arachnid_shield', hashType: 'PDQ', matchedHash: 'x', matchType: 'near', classification: 'csam' },
      ],
      evidenceBucket: 'eb',
      evidenceKey: 'ek',
    });

    expect(mockInsertOne).not.toHaveBeenCalled();
    expect(logModerationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'csam_matches_filtered_out_by_policy' })
    );
  });

  test('deduplicates CSAM reports by idempotency key', async () => {
    mockFindOne
      .mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['ncmec'] })
      .mockResolvedValueOnce({ idempotencyKey: 'csam:media-123' });

    await handler({
      mediaId: 'media-123',
      status: 'rejected',
      csamMatches: [
        { source: 'ncmec', hashType: 'MD5', matchedHash: 'x', matchType: 'exact', classification: 'csam' },
      ],
      evidenceBucket: 'eb',
      evidenceKey: 'ek',
    });

    expect(mockInsertOne).not.toHaveBeenCalled();
    expect(logModerationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'csam_report_deduped' })
    );
  });

  test('includes evidence and IP in detection metadata', async () => {
    mockFindOneAndUpdate.mockResolvedValue(
      mockMediaDoc({ uploadIpAddress: '198.51.100.42' })
    );
    mockFindOne
      .mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['arachnid_shield'] })
      .mockResolvedValueOnce(null);

    await handler({
      mediaId: 'media-123',
      status: 'rejected',
      csamMatches: [
        { source: 'arachnid_shield', hashType: 'PDQ', matchedHash: 'pdq123', matchType: 'near', classification: 'csam' },
      ],
      evidenceBucket: 'evidence-bucket',
      evidenceKey: 'csam-evidence/media-123/image.jpg',
    });

    const insertedDoc = mockInsertOne.mock.calls[0]![0] as Record<string, unknown>;
    const meta = insertedDoc.detectionMetadata as Record<string, unknown>;
    expect(meta.evidenceBucket).toBe('evidence-bucket');
    expect(meta.evidenceKey).toBe('csam-evidence/media-123/image.jpg');
    expect(meta.uploadIpAddress).toBe('198.51.100.42');
  });

  test('auto-resolves the created report', async () => {
    mockFindOne
      .mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['ncmec'] })
      .mockResolvedValueOnce(null);

    await handler({
      mediaId: 'media-123',
      status: 'rejected',
      csamMatches: [
        { source: 'ncmec', hashType: 'SHA1', matchedHash: 'sha1hash', matchType: 'exact', classification: 'csam' },
      ],
      evidenceBucket: 'eb',
      evidenceKey: 'ek',
    });

    const insertedDoc = mockInsertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertedDoc.status).toBe('resolved');
    const resolution = insertedDoc.resolution as Record<string, unknown>;
    expect(resolution.action).toBe('identity_banned');
    expect(resolution.resolvedBy).toBe('system');
    expect(resolution.notes).toContain('ncmec');
    expect(resolution.notes).toContain('banned_csam');
  });

  test('falls through to generic rejection when no CSAM matches', async () => {
    mockFindOneAndUpdate.mockResolvedValue(mockMediaDoc());
    mockFindOne.mockResolvedValueOnce(null);

    await handler({
      mediaId: 'media-123',
      status: 'rejected',
      rejectionReason: 'other_content_violation',
    });

    expect(mockInsertOne).toHaveBeenCalled();
    const insertedDoc = mockInsertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertedDoc.source).toBe('automated_hash_check');
    expect(insertedDoc.status).toBe('open');
  });
});

describe('E2E media propagation', () => {
  beforeEach(resetMocks);

  test('propagates rejection status to e2e_media via scanHash', async () => {
    mockFindOneAndUpdate.mockResolvedValue(
      mockMediaDoc({ scanHash: 'scan-abc', purpose: 'conv_scan', status: 'rejected' })
    );
    mockFindOne.mockResolvedValue(null);

    const result = await handler({
      mediaId: 'media-123',
      status: 'rejected',
      rejectionReason: 'csam_hash_match',
    });

    expect(result.success).toBe(true);
    expect(mockE2eUpdateOne).toHaveBeenCalled();
  });
});

describe('identity resolution', () => {
  beforeEach(() => {
    resetMocks();
    mockInsertOne.mockResolvedValue({
      insertedId: { toHexString: () => 'report-id-xyz' },
    });
    mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  test('handles BSON ObjectId-like identityId from media doc', async () => {
    const objectIdLike = { toHexString: () => IDENTITY_HEX };
    mockFindOneAndUpdate.mockResolvedValue(
      mockMediaDoc({ identityId: objectIdLike })
    );
    mockFindOne
      .mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['ncmec'] })
      .mockResolvedValueOnce(null);

    await handler({
      mediaId: 'media-123',
      status: 'rejected',
      csamMatches: [
        { source: 'ncmec', hashType: 'MD5', matchedHash: 'x', matchType: 'exact', classification: 'csam' },
      ],
      evidenceBucket: 'eb',
      evidenceKey: 'ek',
    });

    const insertedDoc = mockInsertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertedDoc.targetIdentityId).toBe(IDENTITY_HEX);
  });

  test('skips ban when no identity can be resolved', async () => {
    mockFindOneAndUpdate.mockResolvedValue(
      mockMediaDoc({ identityId: null })
    );
    mockFindOne
      .mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['ncmec'] })
      .mockResolvedValueOnce(null);

    await handler({
      mediaId: 'media-123',
      status: 'rejected',
      csamMatches: [
        { source: 'ncmec', hashType: 'MD5', matchedHash: 'x', matchType: 'exact', classification: 'csam' },
      ],
      evidenceBucket: 'eb',
      evidenceKey: 'ek',
    });

    expect(mockInsertOne).toHaveBeenCalled();
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });
});

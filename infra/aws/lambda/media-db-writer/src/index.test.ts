import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const mockFindOneAndUpdate = mock(() => Promise.resolve(null));
const mockUpdateMany = mock(() => Promise.resolve({ modifiedCount: 0 }));
const mockMediaUpdateOne = mock(() => Promise.resolve({ modifiedCount: 1 }));
const mockFindOne = mock(() => Promise.resolve(null));
const mockInsertOne = mock(() =>
  Promise.resolve({ insertedId: { toHexString: () => 'report-id-abc' } })
);
const mockUpdateOne = mock(() => Promise.resolve({ modifiedCount: 1 }));
const mockCountDocuments = mock(() => Promise.resolve(0));
const mockDeleteMany = mock(() => Promise.resolve({ deletedCount: 0 }));
const mockEstimatedDocumentCount = mock(() => Promise.resolve(100));
const mockCommand = mock(() => Promise.resolve({ ok: 1 }));

const mockE2eUpdateOne = mock(() => Promise.resolve({ matchedCount: 1 }));

const mockPurgeConvScanCleartext = mock(() =>
  Promise.resolve({ s3KeysDeleted: 2, mongoRowsDeleted: 3 })
);
const mockCountOpenHashCheckReportsByScanHash = mock(() => Promise.resolve(0));

function createMockCollection(name: string) {
  return {
    findOneAndUpdate: mockFindOneAndUpdate,
    updateMany: mockUpdateMany,
    updateOne:
      name === 'media_uploads'
        ? mockMediaUpdateOne
        : name === 'identities'
          ? mockUpdateOne
          : name === 'e2e_media'
            ? mockE2eUpdateOne
            : mock(() => Promise.resolve({ modifiedCount: 0 })),
    findOne: mockFindOne,
    insertOne: name === 'platform_reports' ? mockInsertOne : mock(() => Promise.resolve({ insertedId: null })),
    countDocuments: name === 'platform_reports' ? mockCountDocuments : mock(() => Promise.resolve(0)),
    deleteMany: name === 'media_uploads' ? mockDeleteMany : mock(() => Promise.resolve({ deletedCount: 0 })),
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

mock.module('./conv-scan-purge', () => ({
  countOpenHashCheckReportsByScanHash: mockCountOpenHashCheckReportsByScanHash,
  purgeConvScanCleartext: mockPurgeConvScanCleartext,
}));

import { handler } from './index';
import { logModerationEvent } from './logging';

afterAll(() => mock.restore());

const IDENTITY_HEX = 'aabbccddeeff00112233aabb';

function resetMocks(): void {
  mockFindOneAndUpdate.mockReset();
  mockUpdateMany.mockReset();
  mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });
  mockMediaUpdateOne.mockReset();
  mockMediaUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mockFindOne.mockReset();
  mockInsertOne.mockReset();
  mockInsertOne.mockResolvedValue({
    insertedId: { toHexString: () => 'report-id-abc' },
  });
  mockUpdateOne.mockReset();
  mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mockCountDocuments.mockReset();
  mockCountDocuments.mockResolvedValue(0);
  mockDeleteMany.mockReset();
  mockDeleteMany.mockResolvedValue({ deletedCount: 0 });
  mockE2eUpdateOne.mockReset();
  mockE2eUpdateOne.mockResolvedValue({ matchedCount: 1 });
  mockPurgeConvScanCleartext.mockReset();
  mockPurgeConvScanCleartext.mockResolvedValue({ s3KeysDeleted: 2, mongoRowsDeleted: 3 });
  mockCountOpenHashCheckReportsByScanHash.mockReset();
  mockCountOpenHashCheckReportsByScanHash.mockResolvedValue(0);
  (logModerationEvent as ReturnType<typeof mock>).mockClear();
}

const SCAN_HASH = 'a'.repeat(64);

function mockMediaDoc(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    mediaId: 'media-123',
    identityId: IDENTITY_HEX,
    status: 'rejected',
    ...overrides,
  };
}

function csamEvent(overrides?: Record<string, unknown>) {
  return {
    mediaId: 'media-123',
    status: 'rejected' as const,
    csamMatches: [
      { source: 'ncmec' as const, hashType: 'MD5', matchedHash: 'abc123', matchType: 'exact' as const, classification: 'csam' },
    ],
    evidenceBucket: 'evidence-bucket',
    evidenceKey: 'csam-evidence/media-123/image.jpg',
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
  });

  test('creates internal moderation report with correct fields', async () => {
    mockFindOne
      .mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['ncmec'] })
      .mockResolvedValueOnce(null);

    const result = await handler(csamEvent({ rejectionReason: 'csam_hash_match: MD5:abc123' }));

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

    await handler(csamEvent());

    expect(mockUpdateOne).toHaveBeenCalled();
    const updateCall = mockUpdateOne.mock.calls[0] as unknown[];
    const update = updateCall[1] as Record<string, Record<string, unknown>>;
    expect(update.$set).toMatchObject({ banned: true, bannedReason: 'csam_hash_match' });
    expect(update.$addToSet).toMatchObject({ entitlements: 'banned_csam' });
  });

  test('logs LE report skipped (CSAM_LE_REPORT_ENABLED is false)', async () => {
    mockFindOne
      .mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['ncmec'] })
      .mockResolvedValueOnce(null);

    await handler(csamEvent());

    expect(logModerationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'csam_le_report_skipped',
        mediaId: 'media-123',
        sources: ['ncmec'],
      })
    );
  });

  test('filters out matches from disabled services', async () => {
    mockFindOne.mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['ncmec'] });

    await handler(csamEvent({
      csamMatches: [
        { source: 'arachnid_shield', hashType: 'PDQ', matchedHash: 'x', matchType: 'near', classification: 'csam' },
      ],
    }));

    expect(mockInsertOne).not.toHaveBeenCalled();
    expect(logModerationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'csam_matches_filtered_out_by_policy' })
    );
  });

  test('deduplicates CSAM reports by idempotency key', async () => {
    mockFindOne
      .mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['ncmec'] })
      .mockResolvedValueOnce({ idempotencyKey: 'csam:media-123' });

    await handler(csamEvent());

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

    await handler(csamEvent({
      csamMatches: [
        { source: 'arachnid_shield', hashType: 'PDQ', matchedHash: 'pdq123', matchType: 'near', classification: 'csam' },
      ],
    }));

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

    await handler(csamEvent());

    const insertedDoc = mockInsertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertedDoc.status).toBe('resolved');
    const resolution = insertedDoc.resolution as Record<string, unknown>;
    expect(resolution.action).toBe('identity_banned');
    expect(resolution.resolvedBy).toBe('system');
    expect(resolution.notes).toContain('ncmec');
    expect(resolution.notes).toContain('banned_csam');
  });

  test('falls through to generic rejection when no CSAM matches present', async () => {
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

describe('Option A: upload IP expunge', () => {
  beforeEach(resetMocks);

  test('unsets uploadIpAddress on ready', async () => {
    mockFindOneAndUpdate.mockResolvedValue(
      mockMediaDoc({ status: 'ready', purpose: 'avatar' })
    );

    await handler({ mediaId: 'media-123', status: 'ready' });

    expect(mockMediaUpdateOne).toHaveBeenCalled();
    const updateCall = mockMediaUpdateOne.mock.calls[0] as unknown[];
    const update = updateCall[1] as Record<string, unknown>;
    expect(update.$unset).toEqual({ uploadIpAddress: '' });
    expect(logModerationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'upload_ip_expunged', status: 'ready' })
    );
  });

  test('unsets uploadIpAddress on non-CSAM rejected', async () => {
    mockFindOneAndUpdate.mockResolvedValue(mockMediaDoc({ status: 'rejected' }));
    mockFindOne.mockResolvedValueOnce(null);

    await handler({
      mediaId: 'media-123',
      status: 'rejected',
      rejectionReason: 'other_content_violation',
    });

    expect(mockMediaUpdateOne).toHaveBeenCalled();
    const updateCall = mockMediaUpdateOne.mock.calls[0] as unknown[];
    const update = updateCall[1] as Record<string, unknown>;
    expect(update.$unset).toEqual({ uploadIpAddress: '' });
  });
});

describe('Option E: conv_scan purge on ready', () => {
  beforeEach(resetMocks);

  test('purges conv_scan when ready and no open hash-check report', async () => {
    mockFindOneAndUpdate.mockResolvedValue(
      mockMediaDoc({
        status: 'ready',
        purpose: 'conv_scan',
        scanHash: SCAN_HASH,
      })
    );

    await handler({ mediaId: 'media-123', status: 'ready' });

    expect(mockCountOpenHashCheckReportsByScanHash).toHaveBeenCalledWith(
      expect.anything(),
      SCAN_HASH
    );
    expect(mockPurgeConvScanCleartext).toHaveBeenCalled();
    expect(logModerationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'conv_scan_purged_on_ready', scanHash: SCAN_HASH })
    );
  });

  test('skips purge when open hash-check report exists', async () => {
    mockFindOneAndUpdate.mockResolvedValue(
      mockMediaDoc({
        status: 'ready',
        purpose: 'conv_scan',
        scanHash: SCAN_HASH,
      })
    );
    mockCountOpenHashCheckReportsByScanHash.mockResolvedValueOnce(1);

    await handler({ mediaId: 'media-123', status: 'ready' });

    expect(mockPurgeConvScanCleartext).not.toHaveBeenCalled();
    expect(logModerationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'conv_scan_purge_skipped_open_report', openReports: 1 })
    );
  });
});

describe('identity resolution', () => {
  beforeEach(resetMocks);

  test('handles BSON ObjectId-like identityId from media doc', async () => {
    const objectIdLike = { toHexString: () => IDENTITY_HEX };
    mockFindOneAndUpdate.mockResolvedValue(
      mockMediaDoc({ identityId: objectIdLike })
    );
    mockFindOne
      .mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['ncmec'] })
      .mockResolvedValueOnce(null);

    await handler(csamEvent());

    const insertedDoc = mockInsertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertedDoc.targetIdentityId).toBe(IDENTITY_HEX);
  });

  test('skips ban when no identity can be resolved', async () => {
    mockFindOneAndUpdate.mockResolvedValue(mockMediaDoc({ identityId: null }));
    mockFindOne
      .mockResolvedValueOnce({ key: 'platform-csam-hash-services', value: ['ncmec'] })
      .mockResolvedValueOnce(null);

    await handler(csamEvent());

    expect(mockInsertOne).toHaveBeenCalled();
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });
});

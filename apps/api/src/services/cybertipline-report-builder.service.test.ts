import { describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

const mockIdentityFind = mock(async () => null as {
  username?: string;
  displayName?: string;
  bio?: string;
  isBanned?: boolean;
  updatedAt?: Date;
} | null);

const mockMediaFind = mock(async () => null as { createdAt?: Date } | null);

const mockS3Send = mock(async () => ({
  Body: {
    transformToByteArray: async () => new Uint8Array([0xff, 0xd8, 0xff]),
  },
}));

mock.module('../config', () => ({
  config: { s3: { region: 'us-east-1' } },
}));

mock.module('../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findByIdentityId: mockIdentityFind,
  }),
}));

mock.module('../repositories/media-upload.repository', () => ({
  getMediaUploadRepository: () => ({
    findByMediaId: mockMediaFind,
  }),
}));

mock.module('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mockS3Send;
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

const { buildCyberTiplineReport } = await import('./cybertipline-report-builder.service');

describe('buildCyberTiplineReport', () => {
  test('builds report with IP capture and additionalInfoSummary from detection metadata', async () => {
    mockIdentityFind.mockResolvedValueOnce({
      username: 'user1',
      displayName: 'User One',
      isBanned: true,
      updatedAt: new Date('2026-06-01T12:05:00Z'),
    });
    mockMediaFind.mockResolvedValueOnce({
      createdAt: new Date('2026-06-01T12:00:00Z'),
    });

    const reportId = new ObjectId();
    const bundle = await buildCyberTiplineReport({
      _id: reportId,
      targetIdentityId: 'abc123',
      detectionMetadata: {
        rejectionReason: 'csam_hash_match',
        mediaId: 'media-1',
        uploadIpAddress: '203.0.113.10',
        detectedAt: '2026-06-01T12:00:00Z',
        csamMatches: [
          {
            source: 'ncmec',
            hashType: 'MD5',
            matchedHash: 'deadbeef',
            matchType: 'exact',
          },
        ],
      },
    } as never);

    expect(bundle.report.additionalInfoSummary).toContain('csam_hash_match');
    expect(bundle.report.additionalInfoSummary).toContain('media-1');
    expect(bundle.report.reportedPerson?.screenName).toBe('user1');
    expect(bundle.report.reportedPerson?.ipCaptureEvents?.[0]).toEqual({
      ipAddress: '203.0.113.10',
      eventName: 'Upload',
      dateTime: '2026-06-01T12:00:00.000Z',
    });
    expect(bundle.report.additionalNotes).toContain(reportId.toHexString());
    expect(bundle.evidenceFile).toBeUndefined();
  });

  test('loads evidence from S3 when bucket and key are present', async () => {
    mockS3Send.mockResolvedValueOnce({
      Body: {
        transformToByteArray: async () => new Uint8Array([1, 2, 3]),
      },
    });

    const bundle = await buildCyberTiplineReport({
      _id: new ObjectId(),
      detectionMetadata: {
        evidenceBucket: 'csam-evidence-bucket',
        evidenceKey: 'csam-evidence/m1/scan.jpg',
        csamMatches: [
          {
            source: 'ncmec',
            hashType: 'SHA1',
            matchedHash: 'abc',
            matchType: 'exact',
          },
        ],
      },
    } as never);

    expect(mockS3Send).toHaveBeenCalled();
    expect(bundle.evidenceFile?.fileName).toBe('scan.jpg');
    expect(bundle.evidenceFile?.details.originalHash).toEqual({
      hashType: 'SHA1',
      hashValue: 'abc',
    });
  });

  test('appends S3 warning to notes when evidence fetch fails', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('AccessDenied'));

    const bundle = await buildCyberTiplineReport({
      _id: new ObjectId(),
      detectionMetadata: {
        evidenceBucket: 'bucket',
        evidenceKey: 'key.jpg',
      },
    } as never);

    expect(bundle.evidenceFile).toBeUndefined();
    expect(bundle.report.additionalNotes).toContain('WARNING: Failed to retrieve evidence');
    expect(bundle.report.additionalNotes).toContain('AccessDenied');
  });
});

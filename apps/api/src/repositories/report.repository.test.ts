import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockFindOneAndUpdate = mock(() => Promise.resolve(null)) as AnyMock;

const mockCollection = {
  findOne: mock(() => Promise.resolve(null)) as AnyMock,
  find: mock(() => ({
    sort: mock(() => ({
      skip: mock(() => ({
        limit: mock(() => ({
          toArray: mock(() => Promise.resolve([])),
        })),
      })),
    })),
  })) as AnyMock,
  insertOne: mock(() => Promise.resolve({ insertedId: new ObjectId() })) as AnyMock,
  updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })) as AnyMock,
  countDocuments: mock(() => Promise.resolve(0)) as AnyMock,
  createIndex: mock(() => Promise.resolve('ok')) as AnyMock,
  findOneAndUpdate: mockFindOneAndUpdate,
};

mock.module('../db', () => ({
  getCollection: mock(() => mockCollection),
  Collections: {
    PLATFORM_REPORTS: 'platform_reports',
  },
}));

import { ReportRepository } from './report.repository';

describe('ReportRepository NCMEC claim/finalize', () => {
  const reportId = new ObjectId();
  const actorId = 'moderator-id';

  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockFindOneAndUpdate.mockReset();
    mockFindOneAndUpdate.mockImplementation(() => Promise.resolve(null));
  });

  test('claimNcmecSubmission sets claiming status on eligible report', async () => {
    const claimedDoc = {
      _id: reportId,
      status: 'escalated',
      ncmecStatus: 'claiming',
    };
    mockFindOneAndUpdate.mockImplementation(() => Promise.resolve(claimedDoc));

    const repo = new ReportRepository();
    const result = await repo.claimNcmecSubmission(reportId, actorId);

    expect(result?.ncmecStatus).toBe('claiming');
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: reportId,
        status: { $ne: 'closed' },
        $or: expect.arrayContaining([
          { ncmecStatus: { $exists: false } },
          { ncmecStatus: 'failed' },
          expect.objectContaining({ ncmecStatus: 'claiming' }),
        ]),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ ncmecStatus: 'claiming' }),
      }),
      { returnDocument: 'after' },
    );
  });

  test('claimNcmecSubmission returns null when report is not claimable', async () => {
    mockFindOneAndUpdate.mockImplementation(() => Promise.resolve(null));

    const repo = new ReportRepository();
    const result = await repo.claimNcmecSubmission(reportId, actorId);

    expect(result).toBeNull();
  });

  test('finalizeNcmecSubmission marks submitted on success', async () => {
    const filedAt = new Date('2026-06-01T12:00:00.000Z');
    const finalizedDoc = {
      _id: reportId,
      ncmecStatus: 'submitted',
      ncmecReportId: 'ncmec-123',
    };
    mockFindOneAndUpdate.mockImplementation(() => Promise.resolve(finalizedDoc));

    const repo = new ReportRepository();
    const result = await repo.finalizeNcmecSubmission(reportId, {
      ok: true,
      ncmecReportId: 'ncmec-123',
      actorId,
      filedAt,
    });

    expect(result?.ncmecStatus).toBe('submitted');
    expect(result?.ncmecReportId).toBe('ncmec-123');
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: reportId, ncmecStatus: 'claiming' },
      expect.objectContaining({
        $set: expect.objectContaining({
          ncmecStatus: 'submitted',
          ncmecReportId: 'ncmec-123',
          leReportFiled: true,
        }),
        $addToSet: { tags: 'le_report_filed' },
        $unset: { ncmecError: '' },
      }),
      { returnDocument: 'after' },
    );
  });

  test('finalizeNcmecSubmission marks failed with sanitized error', async () => {
    const finalizedDoc = {
      _id: reportId,
      ncmecStatus: 'failed',
      ncmecError: 'NCMEC service error',
    };
    mockFindOneAndUpdate.mockImplementation(() => Promise.resolve(finalizedDoc));

    const repo = new ReportRepository();
    const result = await repo.finalizeNcmecSubmission(reportId, {
      ok: false,
      ncmecError: 'NCMEC service error',
    });

    expect(result?.ncmecStatus).toBe('failed');
    expect(result?.ncmecError).toBe('NCMEC service error');
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: reportId, ncmecStatus: 'claiming' },
      expect.objectContaining({
        $set: expect.objectContaining({
          ncmecStatus: 'failed',
          ncmecError: 'NCMEC service error',
        }),
        $unset: { ncmecReportId: '' },
      }),
      { returnDocument: 'after' },
    );
  });
});

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const mockCheckNcmec = mock(() => Promise.resolve([]));
const mockCheckArachnid = mock(() => Promise.resolve([]));

mock.module('./csam-hash-check', () => ({
  checkNcmecHashes: mockCheckNcmec,
  checkArachnidShield: mockCheckArachnid,
  computePdqHash: mock(() => Promise.resolve(null)),
}));

import {
  NO_CSAM_PROVIDERS_ERROR,
  runCsamHashChecks,
} from './run-csam-hash-checks';

afterAll(() => mock.restore());

const TEST_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const dynamodb = new DynamoDBClient({});

describe('runCsamHashChecks', () => {
  beforeEach(() => {
    mockCheckNcmec.mockReset();
    mockCheckArachnid.mockReset();
    mockCheckNcmec.mockResolvedValue([]);
    mockCheckArachnid.mockResolvedValue([]);
  });

  test('throws when no CSAM providers are configured', async () => {
    await expect(
      runCsamHashChecks(TEST_BYTES, {
        ncmecHashTable: '',
        arachnidCreds: null,
        dynamodb,
      }),
    ).rejects.toThrow(NO_CSAM_PROVIDERS_ERROR);
  });

  test('runs NCMEC check when table is configured', async () => {
    const result = await runCsamHashChecks(TEST_BYTES, {
      ncmecHashTable: 'test-table',
      arachnidCreds: null,
      dynamodb,
    });

    expect(result).toEqual([]);
    expect(mockCheckNcmec).toHaveBeenCalledTimes(1);
    expect(mockCheckArachnid).not.toHaveBeenCalled();
  });

  test('runs Arachnid check when credentials are configured', async () => {
    const result = await runCsamHashChecks(TEST_BYTES, {
      ncmecHashTable: '',
      arachnidCreds: { username: 'u', password: 'p' },
      dynamodb,
    });

    expect(result).toEqual([]);
    expect(mockCheckArachnid).toHaveBeenCalledTimes(1);
    expect(mockCheckNcmec).not.toHaveBeenCalled();
  });

  test('invokes error callbacks without failing when a provider errors', async () => {
    mockCheckNcmec.mockRejectedValue(new Error('DynamoDB timeout'));
    const onNcmecError = mock(() => {});

    const result = await runCsamHashChecks(TEST_BYTES, {
      ncmecHashTable: 'test-table',
      arachnidCreds: null,
      dynamodb,
      onNcmecError,
    });

    expect(result).toEqual([]);
    expect(onNcmecError).toHaveBeenCalledWith('DynamoDB timeout');
  });
});

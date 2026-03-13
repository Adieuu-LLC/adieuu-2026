import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const mockConfig = {
  rateLimit: {
    enabled: true,
    authRequestIdentifierLimit: 3,
    authRequestIdentifierWindow: 900,
    authRequestIpLimit: 10,
    authRequestIpWindow: 900,
    authVerifyIdentifierLimit: 5,
    authVerifyIdentifierWindow: 900,
    authVerifyIpLimit: 20,
    authVerifyIpWindow: 900,
    globalUserLimit: 100,
    globalUserWindow: 60,
    globalIpLimit: 1000,
    globalIpWindow: 60,
  },
};

let redisConnected = true;
let pipelineExecResult: Array<[null, number]> = [
  [null, 1],
  [null, 1],
  [null, 1],
  [null, 1],
];

const pipelineMock = {
  zremrangebyscore: mock((_key: string, _min: string, _max: number) => pipelineMock),
  zadd: mock((_key: string, _score: number, _member: string) => pipelineMock),
  zcard: mock((_key: string) => pipelineMock),
  expire: mock((_key: string, _ttl: number) => pipelineMock),
  exec: mock(async () => pipelineExecResult),
};

const redisMock = {
  pipeline: mock(() => pipelineMock),
  zremrangebyscore: mock(async () => 1),
  zcard: mock(async () => 0),
  del: mock(async () => 1),
};

mock.module('../config', () => ({
  config: mockConfig,
}));

mock.module('../db', () => ({
  getRedis: () => redisMock,
  isRedisConnected: () => redisConnected,
  RedisKeys: {
    rateLimit: (action: string, identifier: string) => `ratelimit:${action}:${identifier}`,
  },
}));

import {
  checkRateLimit,
  getRateLimitStatus,
  resetRateLimit,
} from './rate-limit.service';

describe('rate-limit.service', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    redisConnected = true;
    mockConfig.rateLimit.enabled = true;
    pipelineExecResult = [
      [null, 1],
      [null, 1],
      [null, 1],
      [null, 1],
    ];

    pipelineMock.zremrangebyscore.mockClear();
    pipelineMock.zadd.mockClear();
    pipelineMock.zcard.mockClear();
    pipelineMock.expire.mockClear();
    pipelineMock.exec.mockClear();

    redisMock.pipeline.mockClear();
    redisMock.zremrangebyscore.mockClear();
    redisMock.zcard.mockClear();
    redisMock.del.mockClear();

    redisMock.zcard.mockResolvedValue(0);
  });

  test('checkRateLimit throws on unknown action without custom config', async () => {
    await expect(checkRateLimit('unknown-action', 'id-1')).rejects.toThrow(
      'Unknown rate limit action'
    );
  });

  test('checkRateLimit allows when rate limiting is disabled', async () => {
    mockConfig.rateLimit.enabled = false;
    const result = await checkRateLimit('auth:request:identifier', 'id-1');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(3);
    expect(redisMock.pipeline).not.toHaveBeenCalled();
  });

  test('checkRateLimit fails open when redis is disconnected', async () => {
    redisConnected = false;
    const result = await checkRateLimit('auth:request:identifier', 'id-1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(redisMock.pipeline).not.toHaveBeenCalled();
  });

  test('checkRateLimit enforces sliding window count from redis pipeline', async () => {
    pipelineExecResult = [
      [null, 1],
      [null, 1],
      [null, 2], // zcard
      [null, 1],
    ];
    const result = await checkRateLimit('auth:request:identifier', 'id-1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(result.limit).toBe(3);
    expect(redisMock.pipeline).toHaveBeenCalledTimes(1);
    expect(pipelineMock.zremrangebyscore).toHaveBeenCalledTimes(1);
    expect(pipelineMock.zadd).toHaveBeenCalledTimes(1);
    expect(pipelineMock.zcard).toHaveBeenCalledTimes(1);
    expect(pipelineMock.expire).toHaveBeenCalledTimes(1);
  });

  test('checkRateLimit denies when count exceeds configured limit', async () => {
    pipelineExecResult = [
      [null, 1],
      [null, 1],
      [null, 4], // zcard over auth:request:identifier limit of 3
      [null, 1],
    ];
    const result = await checkRateLimit('auth:request:identifier', 'id-1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test('getRateLimitStatus returns full allowance when disabled or redis disconnected', async () => {
    mockConfig.rateLimit.enabled = false;
    const disabled = await getRateLimitStatus('auth:request:identifier', 'id-1');
    expect(disabled).toEqual({ count: 0, remaining: 3, limit: 3 });

    mockConfig.rateLimit.enabled = true;
    redisConnected = false;
    const disconnected = await getRateLimitStatus('auth:request:identifier', 'id-1');
    expect(disconnected).toEqual({ count: 0, remaining: 3, limit: 3 });
  });

  test('getRateLimitStatus prunes old entries and reports current count', async () => {
    redisMock.zcard.mockResolvedValue(2);
    const result = await getRateLimitStatus('auth:request:identifier', 'id-1');
    expect(redisMock.zremrangebyscore).toHaveBeenCalledTimes(1);
    expect(redisMock.zcard).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ count: 2, remaining: 1, limit: 3 });
  });

  test('resetRateLimit deletes key only when redis is connected', async () => {
    redisConnected = false;
    await resetRateLimit('auth:request:identifier', 'id-1');
    expect(redisMock.del).not.toHaveBeenCalled();

    redisConnected = true;
    await resetRateLimit('auth:request:identifier', 'id-1');
    expect(redisMock.del).toHaveBeenCalledWith('ratelimit:auth:request:identifier:id-1');
  });
});


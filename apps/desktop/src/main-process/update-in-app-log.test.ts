import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'path';
import { mockApp } from '../test/electron-mock';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getInAppUpdateLogPath } = require('./update-in-app-log') as {
  getInAppUpdateLogPath: () => string;
};

describe('getInAppUpdateLogPath', () => {
  const userData = path.join('/tmp', 'adieuu-user-data-test');

  beforeEach(() => {
    mockApp.getPath.mockImplementation((name: string) => {
      if (name === 'userData') return userData;
      return '/tmp';
    });
  });

  afterEach(() => {
    mockApp.getPath.mockReset();
  });

  it('uses userData/logs/update.log', () => {
    expect(getInAppUpdateLogPath()).toBe(path.join(userData, 'logs', 'update.log'));
  });
});

/**
 * Unit tests for Space platform-setting readers.
 *
 * @module services/space/space-settings.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { PLATFORM_SETTING_KEYS } from '../../constants/platform-settings-keys';

const mockFindByKey = mock(async (_key: string) => null as unknown);

mock.module('../../repositories/platform-settings.repository', () => ({
  getPlatformSettingsRepository: () => ({
    findByKey: mockFindByKey,
  }),
}));

import { isSpaceCreationEnabled } from './space-settings';

describe('isSpaceCreationEnabled', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    mockFindByKey.mockReset();
    mockFindByKey.mockResolvedValue(null);
  });

  test('returns false when the setting is missing', async () => {
    expect(await isSpaceCreationEnabled()).toBe(false);
  });

  test('returns true when the boolean setting is true', async () => {
    mockFindByKey.mockResolvedValue({
      _id: new ObjectId(),
      key: PLATFORM_SETTING_KEYS.SPACE_CREATION_ENABLED,
      valueType: 'boolean',
      value: true,
    });
    expect(await isSpaceCreationEnabled()).toBe(true);
  });

  test('returns false when the boolean setting is false', async () => {
    mockFindByKey.mockResolvedValue({
      _id: new ObjectId(),
      key: PLATFORM_SETTING_KEYS.SPACE_CREATION_ENABLED,
      valueType: 'boolean',
      value: false,
    });
    expect(await isSpaceCreationEnabled()).toBe(false);
  });

  test('returns false when valueType is not boolean', async () => {
    mockFindByKey.mockResolvedValue({
      _id: new ObjectId(),
      key: PLATFORM_SETTING_KEYS.SPACE_CREATION_ENABLED,
      valueType: 'string',
      value: 'true',
    });
    expect(await isSpaceCreationEnabled()).toBe(false);
  });
});

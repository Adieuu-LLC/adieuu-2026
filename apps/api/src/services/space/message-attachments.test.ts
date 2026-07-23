/**
 * Unit tests for Space message attachment validation.
 *
 * @module services/space/message-attachments.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const mediaRepo = {
  findByMediaId: mock(async (_id: string) => null as any) as AnyMock,
};

const e2eRepo = {
  findManyByE2EMediaIds: mock(async (_ids: string[]) => [] as any[]) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../repositories/media-upload.repository', () => ({
  getMediaUploadRepository: () => mediaRepo,
}));
mock.module('../../repositories/e2e-media.repository', () => ({
  getE2EMediaRepository: () => e2eRepo,
}));

import {
  validateSpaceCleartextAttachments,
  validateSpaceE2EAttachments,
} from './message-attachments';

describe('message-attachments', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    mediaRepo.findByMediaId.mockClear();
    mediaRepo.findByMediaId.mockResolvedValue(null);
    e2eRepo.findManyByE2EMediaIds.mockClear();
    e2eRepo.findManyByE2EMediaIds.mockResolvedValue([]);
  });

  describe('validateSpaceCleartextAttachments', () => {
    test('accepts ready space_media owned by sender in the same Space', async () => {
      const spaceId = new ObjectId();
      const senderId = new ObjectId();
      mediaRepo.findByMediaId.mockResolvedValue({
        mediaId: 'm1',
        purpose: 'space_media',
        status: 'ready',
        cdnUrl: 'https://cdn.example/m1.webp',
        contentType: 'image/webp',
        identityId: senderId,
        spaceId,
      });

      const r = await validateSpaceCleartextAttachments(spaceId, senderId, ['m1']);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.attachmentMediaIds).toEqual(['m1']);
        expect(r.attachments[0]?.cdnUrl).toBe('https://cdn.example/m1.webp');
      }
    });

    test('rejects media bound to a different Space', async () => {
      const spaceId = new ObjectId();
      const senderId = new ObjectId();
      mediaRepo.findByMediaId.mockResolvedValue({
        mediaId: 'm1',
        purpose: 'space_media',
        status: 'ready',
        cdnUrl: 'https://cdn.example/m1.webp',
        contentType: 'image/webp',
        identityId: senderId,
        spaceId: new ObjectId(),
      });

      const r = await validateSpaceCleartextAttachments(spaceId, senderId, ['m1']);
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_MEDIA' });
    });

    test('rejects non-ready media', async () => {
      const spaceId = new ObjectId();
      const senderId = new ObjectId();
      mediaRepo.findByMediaId.mockResolvedValue({
        mediaId: 'm1',
        purpose: 'space_media',
        status: 'processing',
        identityId: senderId,
        spaceId,
      });

      const r = await validateSpaceCleartextAttachments(spaceId, senderId, ['m1']);
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_MEDIA' });
    });
  });

  describe('validateSpaceE2EAttachments', () => {
    test('accepts owned non-pending non-rejected E2E media', async () => {
      const senderId = new ObjectId();
      e2eRepo.findManyByE2EMediaIds.mockResolvedValue([
        {
          e2eMediaId: 'e1',
          identityId: senderId,
          status: 'available',
          moderationStatus: 'passed',
        },
      ]);

      const r = await validateSpaceE2EAttachments(senderId, ['e1']);
      expect(r).toEqual({ success: true, e2eMediaIds: ['e1'] });
    });

    test('rejects when ownership mismatches', async () => {
      e2eRepo.findManyByE2EMediaIds.mockResolvedValue([
        {
          e2eMediaId: 'e1',
          identityId: new ObjectId(),
          status: 'available',
          moderationStatus: 'passed',
        },
      ]);

      const r = await validateSpaceE2EAttachments(new ObjectId(), ['e1']);
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_MEDIA' });
    });

    test('rejects pending uploads', async () => {
      const senderId = new ObjectId();
      e2eRepo.findManyByE2EMediaIds.mockResolvedValue([
        {
          e2eMediaId: 'e1',
          identityId: senderId,
          status: 'pending',
          moderationStatus: 'pending',
        },
      ]);

      const r = await validateSpaceE2EAttachments(senderId, ['e1']);
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_MEDIA' });
    });
  });
});

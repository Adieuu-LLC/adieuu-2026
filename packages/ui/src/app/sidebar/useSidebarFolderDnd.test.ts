import { describe, expect, it } from 'bun:test';
import {
  buildCreateFolderParams,
  folderableDndId,
  parseFolderDropId,
  parseFolderableDndId,
} from './useSidebarFolderDnd';

describe('useSidebarFolderDnd helpers', () => {
  it('round-trips folderable dnd ids', () => {
    expect(folderableDndId('conversation', 'abc')).toBe('conversation:abc');
    expect(folderableDndId('space', 'xyz')).toBe('space:xyz');
    expect(parseFolderableDndId('conversation:abc')).toEqual({
      kind: 'conversation',
      id: 'abc',
    });
    expect(parseFolderableDndId('space:xyz')).toEqual({ kind: 'space', id: 'xyz' });
    expect(parseFolderableDndId('folder:1')).toBeNull();
  });

  it('parses folder drop targets', () => {
    expect(parseFolderDropId('folder:abc')).toBe('abc');
    expect(parseFolderDropId('conversation:abc')).toBeNull();
  });

  it('builds create params for mixed membership', () => {
    expect(
      buildCreateFolderParams(
        'New',
        { kind: 'conversation', id: 'c1' },
        { kind: 'space', id: 's1' },
      ),
    ).toEqual({
      name: 'New',
      conversationIds: ['c1'],
      spaceIds: ['s1'],
    });

    expect(
      buildCreateFolderParams(
        'New',
        { kind: 'space', id: 's1' },
        { kind: 'space', id: 's2' },
      ),
    ).toEqual({
      name: 'New',
      spaceIds: ['s1', 's2'],
    });
  });
});

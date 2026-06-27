import { describe, expect, test } from 'bun:test';
import { resolveSidebarUpdateNav } from './sidebarUpdateNavState';

describe('resolveSidebarUpdateNav', () => {
  test('hides when installing', () => {
    expect(
      resolveSidebarUpdateNav('available', 'desktop', true, null),
    ).toEqual({ visible: false });
  });

  test('hides idle, dismissed, up-to-date, checking', () => {
    for (const s of ['idle', 'dismissed', 'up-to-date', 'checking'] as const) {
      expect(resolveSidebarUpdateNav(s, 'desktop', false, null)).toEqual({
        visible: false,
      });
    }
  });

  test('error is visible on any platform', () => {
    expect(resolveSidebarUpdateNav('error', 'web', false, null)).toEqual({
      visible: true,
      label: 'error',
      progressPercent: null,
    });
  });

  test('downloading includes percent from progress', () => {
    expect(
      resolveSidebarUpdateNav('downloading', 'desktop', false, {
        percent: 42,
        transferred: 4,
        total: 10,
      }),
    ).toEqual({
      visible: true,
      label: 'downloading',
      progressPercent: 42,
    });
  });

  test('downloading defaults percent to 0 when progress missing', () => {
    expect(resolveSidebarUpdateNav('downloading', 'desktop', false, null)).toEqual({
      visible: true,
      label: 'downloading',
      progressPercent: 0,
    });
  });

  test('ready shows install on desktop only', () => {
    expect(resolveSidebarUpdateNav('ready', 'desktop', false, null)).toEqual({
      visible: true,
      label: 'install',
      progressPercent: null,
    });
    expect(resolveSidebarUpdateNav('ready', 'web', false, null)).toEqual({
      visible: false,
    });
    expect(resolveSidebarUpdateNav('ready', 'mobile', false, null)).toEqual({
      visible: false,
    });
  });

  test('available uses refreshWeb on web and available elsewhere', () => {
    expect(resolveSidebarUpdateNav('available', 'web', false, null)).toEqual({
      visible: true,
      label: 'refreshWeb',
      progressPercent: null,
    });
    expect(resolveSidebarUpdateNav('available', 'desktop', false, null)).toEqual({
      visible: true,
      label: 'available',
      progressPercent: null,
    });
    expect(resolveSidebarUpdateNav('available', 'mobile', false, null)).toEqual({
      visible: true,
      label: 'available',
      progressPercent: null,
    });
  });
});

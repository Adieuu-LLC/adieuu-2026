import { describe, expect, test } from 'bun:test';
import { resolveRouteChrome } from './resolveRouteChrome';

describe('resolveRouteChrome', () => {
  test('maps home route', () => {
    expect(resolveRouteChrome('/')).toMatchObject({
      icon: 'home',
      titleKey: 'home.title',
    });
  });

  test('maps conversation routes as dynamic', () => {
    expect(resolveRouteChrome('/conversations/abc-123')).toMatchObject({
      icon: 'message',
      dynamic: 'conversation',
    });
  });

  test('maps identity settings vs public profile', () => {
    expect(resolveRouteChrome('/identity/profile')).toMatchObject({
      icon: 'mask',
      titleKey: 'identity.profile.title',
    });
    expect(resolveRouteChrome('/identity/some-uuid')).toMatchObject({
      icon: 'mask',
      dynamic: 'identity-profile',
    });
  });

  test('maps roadmap route', () => {
    expect(resolveRouteChrome('/about/roadmap')).toMatchObject({
      icon: 'info',
      titleKey: 'about.roadmap.title',
    });
  });

  test('maps space routes with singular title', () => {
    expect(resolveRouteChrome('/spaces/new')).toMatchObject({
      icon: 'spaces',
      titleKey: 'spaces.create.title',
      titleDefault: 'Create a Space',
    });
    expect(resolveRouteChrome('/s/my-space')).toMatchObject({
      icon: 'spaces',
      titleKey: 'spaces.spaceTitle',
      titleDefault: 'Space',
    });
    expect(resolveRouteChrome('/spaces')).toMatchObject({
      icon: 'spaces',
      titleKey: 'spaces.title',
      titleDefault: 'Spaces',
    });
  });

  test('maps admin sub-routes', () => {
    expect(resolveRouteChrome('/admin/spaces')).toMatchObject({
      icon: 'shield',
      titleKey: 'admin.spaces.title',
    });
    expect(resolveRouteChrome('/admin/users')).toMatchObject({
      icon: 'shield',
      titleKey: 'admin.users.title',
    });
  });
});

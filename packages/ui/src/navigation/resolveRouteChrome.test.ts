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

  test('maps admin sub-routes', () => {
    expect(resolveRouteChrome('/admin/users')).toMatchObject({
      icon: 'shield',
      titleKey: 'admin.users.title',
    });
  });
});

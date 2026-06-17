import { describe, expect, it } from 'vitest';
import { resolveRouteChrome } from './resolveRouteChrome';

describe('resolveRouteChrome', () => {
  it('maps home route', () => {
    expect(resolveRouteChrome('/')).toMatchObject({
      icon: 'home',
      titleKey: 'home.title',
    });
  });

  it('maps conversation routes as dynamic', () => {
    expect(resolveRouteChrome('/conversations/abc-123')).toMatchObject({
      icon: 'message',
      dynamic: 'conversation',
    });
  });

  it('maps identity settings vs public profile', () => {
    expect(resolveRouteChrome('/identity/profile')).toMatchObject({
      icon: 'mask',
      titleKey: 'identity.profile.title',
    });
    expect(resolveRouteChrome('/identity/some-uuid')).toMatchObject({
      icon: 'mask',
      dynamic: 'identity-profile',
    });
  });

  it('maps admin sub-routes', () => {
    expect(resolveRouteChrome('/admin/users')).toMatchObject({
      icon: 'shield',
      titleKey: 'admin.users.title',
    });
  });
});

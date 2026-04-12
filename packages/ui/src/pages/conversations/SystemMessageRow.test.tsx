import { describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts: string | Record<string, unknown>) => {
      if (typeof opts === 'string') return opts;
      return (opts as { defaultValue?: string }).defaultValue ?? _key;
    },
  }),
}));

const { SystemMessageRow } = await import('./SystemMessageRow');

const baseEvent = {
  identityId: 'id-12345678',
  displayName: 'Alice',
};

describe('SystemMessageRow', () => {
  test('renders member_joined', () => {
    const html = renderToStaticMarkup(
      <SystemMessageRow event={{ ...baseEvent, type: 'member_joined' } as any} />
    );
    expect(html).toContain('Alice has joined the conversation');
    expect(html).toContain('dm-system-message');
  });

  test('renders member_invited with actor', () => {
    const html = renderToStaticMarkup(
      <SystemMessageRow event={{
        ...baseEvent,
        type: 'member_invited',
        username: 'alice',
        actorIdentityId: 'actor-1',
        actorDisplayName: 'Bob',
        actorUsername: 'bob',
      } as any} />
    );
    expect(html).toContain('Alice (@alice) was invited by Bob (@bob)');
  });

  test('renders member_invited without actor as invitee-only line', () => {
    const html = renderToStaticMarkup(
      <SystemMessageRow event={{ ...baseEvent, type: 'member_invited' } as any} />
    );
    expect(html).toContain('Alice was invited');
  });

  test('renders member_left', () => {
    const html = renderToStaticMarkup(
      <SystemMessageRow event={{ ...baseEvent, type: 'member_left' } as any} />
    );
    expect(html).toContain('Alice has left the conversation');
  });

  test('renders member_removed with actor', () => {
    const html = renderToStaticMarkup(
      <SystemMessageRow event={{
        ...baseEvent,
        type: 'member_removed',
        actorIdentityId: 'actor-1',
        actorDisplayName: 'Bob',
      } as any} />
    );
    expect(html).toContain('Bob removed Alice from the group');
  });

  test('renders member_removed without actor', () => {
    const html = renderToStaticMarkup(
      <SystemMessageRow event={{ ...baseEvent, type: 'member_removed' } as any} />
    );
    expect(html).toContain('Alice was removed from the group');
  });

  test('renders admin_promoted with actor', () => {
    const html = renderToStaticMarkup(
      <SystemMessageRow event={{
        ...baseEvent,
        type: 'admin_promoted',
        actorIdentityId: 'actor-1',
        actorDisplayName: 'Bob',
      } as any} />
    );
    expect(html).toContain('Bob made Alice an admin');
  });

  test('renders admin_promoted without actor', () => {
    const html = renderToStaticMarkup(
      <SystemMessageRow event={{ ...baseEvent, type: 'admin_promoted' } as any} />
    );
    expect(html).toContain('Alice is now an admin');
  });

  test('renders group_renamed with actor', () => {
    const html = renderToStaticMarkup(
      <SystemMessageRow event={{
        ...baseEvent,
        type: 'group_renamed',
        actorIdentityId: 'actor-1',
        actorDisplayName: 'Bob',
      } as any} />
    );
    expect(html).toContain('Bob renamed the group');
  });

  test('renders group_renamed without actor', () => {
    const html = renderToStaticMarkup(
      <SystemMessageRow event={{ ...baseEvent, type: 'group_renamed' } as any} />
    );
    expect(html).toContain('Alice renamed the group');
  });

  test('renders unknown event type as-is', () => {
    const html = renderToStaticMarkup(
      <SystemMessageRow event={{ ...baseEvent, type: 'some_unknown_type' } as any} />
    );
    expect(html).toContain('some_unknown_type');
  });

  test('uses truncated ID when displayName absent', () => {
    const html = renderToStaticMarkup(
      <SystemMessageRow event={{
        identityId: 'abcdefghijklmnop',
        type: 'member_joined',
      } as any} />
    );
    expect(html).toContain('abcdefgh');
  });
});

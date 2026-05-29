import { describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key,
  }),
}));

mock.module('../../icons/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

const { IncomingCallBanner } = await import('./IncomingCallBanner');

describe('IncomingCallBanner', () => {
  test('renders video call label', () => {
    const html = renderToStaticMarkup(
      <IncomingCallBanner
        callerName="Alice"
        hasAudio
        hasVideo
        hasScreenshare={false}
        onAccept={() => {}}
        onDecline={() => {}}
      />
    );
    expect(html).toContain('Alice');
    expect(html).toContain('Video call');
  });

  test('renders audio call label when video disabled', () => {
    const html = renderToStaticMarkup(
      <IncomingCallBanner
        callerName="Bob"
        hasAudio
        hasVideo={false}
        hasScreenshare={false}
        onAccept={() => {}}
        onDecline={() => {}}
      />
    );
    expect(html).toContain('Audio call');
  });

  test('renders screenshare label for screenshare-only calls', () => {
    const html = renderToStaticMarkup(
      <IncomingCallBanner
        callerName="Carol"
        hasAudio={false}
        hasVideo={false}
        hasScreenshare
        onAccept={() => {}}
        onDecline={() => {}}
      />
    );
    expect(html).toContain('Screen share');
  });
});

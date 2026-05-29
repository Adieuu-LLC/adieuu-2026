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

mock.module('../Button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

const { IncomingCallBanner } = await import('./IncomingCallBanner');

describe('IncomingCallBanner', () => {
  test('renders generic incoming call label with caller name', () => {
    const html = renderToStaticMarkup(
      <IncomingCallBanner
        callerName="Alice"
        onAccept={() => {}}
        onDecline={() => {}}
      />,
    );
    expect(html).toContain('Alice');
    expect(html).toContain('call.incoming');
  });

  test('renders accept and decline buttons', () => {
    const html = renderToStaticMarkup(
      <IncomingCallBanner
        callerName="Bob"
        onAccept={() => {}}
        onDecline={() => {}}
      />,
    );
    expect(html).toContain('incoming-call-accept');
    expect(html).toContain('incoming-call-decline');
  });
});

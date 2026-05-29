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

mock.module('../Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { ConversationCallButton } = await import('./ConversationCallButton');

const noop = () => {};

describe('ConversationCallButton', () => {
  test('renders phone icon', () => {
    const html = renderToStaticMarkup(
      <ConversationCallButton
        disabled={false}
        inCallForThisConversation={false}
        onStartCall={noop}
      />,
    );
    expect(html).toContain('data-icon="phone"');
    expect(html).toContain('call-toolbar-btn--single');
  });

  test('primary button is disabled when disabled prop is true', () => {
    const html = renderToStaticMarkup(
      <ConversationCallButton
        disabled
        disabledReason="Already in a call"
        inCallForThisConversation={false}
        onStartCall={noop}
      />,
    );
    expect(html).toContain('disabled');
  });

  test('shows in-call styling when inCallForThisConversation is true', () => {
    const html = renderToStaticMarkup(
      <ConversationCallButton
        disabled={false}
        inCallForThisConversation
        onStartCall={noop}
      />,
    );
    expect(html).toContain('call-toolbar-btn--in-call');
  });
});

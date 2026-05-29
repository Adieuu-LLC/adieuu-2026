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

mock.module('@ark-ui/react', () => ({
  Menu: {
    Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Positioner: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Item: ({ children, value }: { children: React.ReactNode; value: string }) => (
      <div data-value={value}>{children}</div>
    ),
  },
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { ConversationCallButton } = await import('./ConversationCallButton');

const noop = () => {};

describe('ConversationCallButton', () => {
  test('returns null when all call types are disabled', () => {
    const html = renderToStaticMarkup(
      <ConversationCallButton
        audioAllowed={false}
        videoAllowed={false}
        screenshareAllowed={false}
        disabled={false}
        inCallForThisConversation={false}
        onStartCall={noop}
      />,
    );
    expect(html).toBe('');
  });

  test('renders phone icon when audio is allowed', () => {
    const html = renderToStaticMarkup(
      <ConversationCallButton
        audioAllowed
        videoAllowed={false}
        screenshareAllowed={false}
        disabled={false}
        inCallForThisConversation={false}
        onStartCall={noop}
      />,
    );
    expect(html).toContain('data-icon="phone"');
    expect(html).toContain('call-toolbar-btn--single');
  });

  test('renders chevron menu when multiple types allowed', () => {
    const html = renderToStaticMarkup(
      <ConversationCallButton
        audioAllowed
        videoAllowed
        screenshareAllowed={false}
        disabled={false}
        inCallForThisConversation={false}
        onStartCall={noop}
      />,
    );
    expect(html).toContain('call-toolbar-btn__chevron');
    expect(html).not.toContain('call-toolbar-btn--single');
  });

  test('primary button is disabled when disabled prop is true', () => {
    const html = renderToStaticMarkup(
      <ConversationCallButton
        audioAllowed
        videoAllowed={false}
        screenshareAllowed={false}
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
        audioAllowed
        videoAllowed={false}
        screenshareAllowed={false}
        disabled={false}
        inCallForThisConversation
        onStartCall={noop}
      />,
    );
    expect(html).toContain('call-toolbar-btn--in-call');
  });

  test('renders menu items for all allowed types', () => {
    const html = renderToStaticMarkup(
      <ConversationCallButton
        audioAllowed
        videoAllowed
        screenshareAllowed
        disabled={false}
        inCallForThisConversation={false}
        onStartCall={noop}
      />,
    );
    expect(html).toContain('data-value="phone"');
    expect(html).toContain('data-value="video"');
    expect(html).toContain('data-value="screenShare"');
  });
});

import { describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { setMockTranslate } from '../../test/react-i18next-mock';

setMockTranslate((_key, defaultValueOrOpts) =>
  typeof defaultValueOrOpts === 'string' ? defaultValueOrOpts : _key,
);

mock.module('../../icons/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

const { CallControls } = await import('./CallControls');

const noop = () => {};

describe('CallControls', () => {
  test('exposes aria-label and aria-pressed on audio toggle', () => {
    const html = renderToStaticMarkup(
      <CallControls
        isAudioEnabled
        isVideoEnabled={false}
        isScreensharing={false}
        audioAllowed
        videoAllowed={false}
        screenshareAllowed={false}
        onToggleAudio={noop}
        onToggleVideo={noop}
        onToggleScreenshare={noop}
        onLeave={noop}
      />
    );
    expect(html).toContain('aria-label="Mute"');
    expect(html).toContain('aria-pressed="true"');
  });

  test('shows unmute label when audio disabled', () => {
    const html = renderToStaticMarkup(
      <CallControls
        isAudioEnabled={false}
        isVideoEnabled={false}
        isScreensharing={false}
        audioAllowed
        videoAllowed={false}
        screenshareAllowed={false}
        onToggleAudio={noop}
        onToggleVideo={noop}
        onToggleScreenshare={noop}
        onLeave={noop}
      />
    );
    expect(html).toContain('aria-label="Unmute"');
    expect(html).toContain('aria-pressed="false"');
  });

  test('renders leave control with accessible name', () => {
    const html = renderToStaticMarkup(
      <CallControls
        isAudioEnabled={false}
        isVideoEnabled={false}
        isScreensharing={false}
        audioAllowed={false}
        videoAllowed={false}
        screenshareAllowed={false}
        onToggleAudio={noop}
        onToggleVideo={noop}
        onToggleScreenshare={noop}
        onLeave={noop}
      />
    );
    expect(html).toContain('aria-label="Leave call"');
  });
});

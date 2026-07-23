import { describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { setMockTranslate } from '../../test/react-i18next-mock';

setMockTranslate((_key, defaultValueOrOpts) =>
  typeof defaultValueOrOpts === 'string' ? defaultValueOrOpts : _key,
);

mock.module('../Button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

mock.module('../../hooks/useCallMedia', () => ({
  enumerateMediaDevices: async () => [],
  isBrowserDefaultDeviceId: (id: string) => id === 'default' || id === 'communications',
}));

mock.module('../../hooks/avPreferenceStorage', () => ({
  getAvMicDeviceId: () => null,
  getAvCameraDeviceId: () => null,
  getAvSpeakerDeviceId: () => null,
  getAvJoinCameraOff: () => true,
}));

const arkUi = await import('@ark-ui/react');

mock.module('@ark-ui/react', () => {
  const DialogRoot = ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <>{children}</> : null;
  const DialogBackdrop = () => <div data-testid="backdrop" />;
  const DialogPositioner = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const DialogContent = ({ children, style }: { children: React.ReactNode; style?: any }) => <div style={style}>{children}</div>;
  const DialogTitle = ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>;

  return {
    ...arkUi,
    Dialog: Object.assign({}, arkUi.Dialog, {
      Root: DialogRoot,
      Backdrop: DialogBackdrop,
      Positioner: DialogPositioner,
      Content: DialogContent,
      Title: DialogTitle,
    }),
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const { CallDeviceSetupModal } = await import('./CallDeviceSetupModal');

const noop = () => {};

describe('CallDeviceSetupModal', () => {
  test('renders mic, speaker, and camera selects', () => {
    const html = renderToStaticMarkup(
      <CallDeviceSetupModal
        open
        isJoin={false}
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(html).toContain('call-mic-select');
    expect(html).toContain('call-speaker-select');
    expect(html).toContain('call-camera-select');
    expect(html).toContain('call.confirmCall');
    expect(html).toContain('call-device-setup__note');
  });

  test('shows Join button when isJoin is true', () => {
    const html = renderToStaticMarkup(
      <CallDeviceSetupModal
        open
        isJoin
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(html).toContain('call.confirmJoin');
  });

  test('shows voice confirm label for voice variant', () => {
    const html = renderToStaticMarkup(
      <CallDeviceSetupModal
        open
        variant="voice"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(html).toContain('call.confirmJoinVoice');
  });

  test('not rendered when open is false', () => {
    const html = renderToStaticMarkup(
      <CallDeviceSetupModal
        open={false}
        isJoin={false}
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(html).toBe('');
  });
});

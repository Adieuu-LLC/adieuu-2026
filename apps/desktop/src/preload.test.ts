import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { mockIpcRenderer, mockContextBridge, ipcListeners } from './test/electron-mock';

type Listener = (...args: unknown[]) => void;

function getExposedApi(): {
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
} {
  // Re-import to trigger the module (contextBridge.exposeInMainWorld is called at module level)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./preload');

  const { contextBridge } = require('electron') as {
    contextBridge: { exposeInMainWorld: ReturnType<typeof mock> };
  };

  const call = contextBridge.exposeInMainWorld.mock.calls[
    contextBridge.exposeInMainWorld.mock.calls.length - 1
  ] as unknown as [string, { on: (channel: string, callback: (...args: unknown[]) => void) => () => void }];
  return call[1];
}

describe('preload IPC listener cleanup', () => {
  beforeEach(() => {
    ipcListeners.clear();
    mockIpcRenderer.on.mockClear();
    mockIpcRenderer.removeListener.mockClear();
  });

  test('on() returns a function for allowed channels', () => {
    const api = getExposedApi();
    const unsubscribe = api.on('deep-link', () => {});

    expect(typeof unsubscribe).toBe('function');
  });

  test('on() registers a listener via ipcRenderer.on', () => {
    const api = getExposedApi();
    api.on('deep-link', () => {});

    expect(mockIpcRenderer.on).toHaveBeenCalled();
    const onCalls = mockIpcRenderer.on.mock.calls as unknown as [string, Listener][];
    const deepLinkCalls = onCalls.filter((c) => c[0] === 'deep-link');
    expect(deepLinkCalls.length).toBeGreaterThan(0);
  });

  test('calling the returned unsubscribe removes the listener', () => {
    const api = getExposedApi();
    const unsubscribe = api.on('deep-link', () => {});

    expect(ipcListeners.get('deep-link')?.size).toBe(1);

    unsubscribe();

    expect(ipcListeners.get('deep-link')?.size).toBe(0);
    expect(mockIpcRenderer.removeListener).toHaveBeenCalled();
  });

  test('multiple subscriptions produce independent unsubscribers', () => {
    const api = getExposedApi();
    const unsub1 = api.on('deep-link', () => {});
    const unsub2 = api.on('deep-link', () => {});

    expect(ipcListeners.get('deep-link')?.size).toBe(2);

    unsub1();
    expect(ipcListeners.get('deep-link')?.size).toBe(1);

    unsub2();
    expect(ipcListeners.get('deep-link')?.size).toBe(0);
  });

  test('on() returns a no-op for disallowed channels', () => {
    const api = getExposedApi();
    const initialOnCallCount = mockIpcRenderer.on.mock.calls.length;

    const unsubscribe = api.on('not-allowed-channel', () => {});

    expect(typeof unsubscribe).toBe('function');
    expect(mockIpcRenderer.on.mock.calls.length).toBe(initialOnCallCount);

    unsubscribe();
    expect(mockIpcRenderer.removeListener).not.toHaveBeenCalled();
  });
});

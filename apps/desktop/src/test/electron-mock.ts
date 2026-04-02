/**
 * Comprehensive Electron mock shared by all desktop test files.
 *
 * Bun runs every test file in a single process, so multiple calls to
 * mock.module('electron', ...) with different shapes cause stale-cache
 * conflicts. This module is the single source of truth: it calls
 * mock.module once with every export any test file might need.
 *
 * Test files import the individual mock objects to customise or inspect them.
 */
import { mock } from 'bun:test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Listener = (...args: unknown[]) => void;
type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

// ---------------------------------------------------------------------------
// Shared state for test inspection
// ---------------------------------------------------------------------------

export const ipcHandlers = new Map<string, IpcHandler>();
export const ipcListeners = new Map<string, Set<Listener>>();

// ---------------------------------------------------------------------------
// Configurable behaviour
// ---------------------------------------------------------------------------

let _safeStorageAvailable = false;
export function setSafeStorageAvailable(v: boolean): void {
  _safeStorageAvailable = v;
}

// ---------------------------------------------------------------------------
// Mock objects
// ---------------------------------------------------------------------------

export const mockApp = {
  getPath: mock((_name: string): string => ''),
};

export const mockIpcMain = {
  handle: mock((channel: string, handler: IpcHandler) => {
    ipcHandlers.set(channel, handler);
  }),
};

export const mockIpcRenderer = {
  invoke: mock((_channel: string, ..._args: unknown[]) => Promise.resolve()),
  on: mock((channel: string, listener: Listener) => {
    if (!ipcListeners.has(channel)) ipcListeners.set(channel, new Set());
    ipcListeners.get(channel)!.add(listener);
    return mockIpcRenderer;
  }),
  removeListener: mock((channel: string, listener: Listener) => {
    ipcListeners.get(channel)?.delete(listener);
    return mockIpcRenderer;
  }),
};

export const mockContextBridge = {
  exposeInMainWorld: mock((_apiKey: string, _api: unknown) => {}),
};

export const mockSafeStorage = {
  isEncryptionAvailable: () => _safeStorageAvailable,
  encryptString: (s: string) => Buffer.from(`enc:${s}`),
  decryptString: (buf: Buffer) => {
    const str = buf.toString();
    if (!str.startsWith('enc:')) throw new Error('Cannot decrypt');
    return str.slice(4);
  },
};

// ---------------------------------------------------------------------------
// Register the mock — called exactly once when this module is first imported
// ---------------------------------------------------------------------------

mock.module('electron', () => ({
  app: mockApp,
  ipcMain: mockIpcMain,
  ipcRenderer: mockIpcRenderer,
  contextBridge: mockContextBridge,
  safeStorage: mockSafeStorage,
}));

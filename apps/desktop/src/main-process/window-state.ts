import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { app, BrowserWindow, screen } from 'electron';
import { runtime } from './runtime';
import { rectanglesIntersect } from './window-layout-geometry';

const STATE_FILENAME = 'window-layout-state.json';
const DEBOUNCE_MS = 400;
export const MIN_WIN_WIDTH = 320;
export const MIN_WIN_HEIGHT = 400;
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;

export type LayoutState = {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
  isFullScreen: boolean;
};

type PersistedFile = {
  v: 1;
  layouts: Record<string, LayoutState>;
};

let persisted: PersistedFile = { v: 1, layouts: {} };
let trackedFingerprint: string | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Sorted display ids + bounds — stable while the same physical layout is connected. */
export function getDisplayLayoutFingerprint(): string {
  return screen
    .getAllDisplays()
    .slice()
    .sort((a, b) => a.id - b.id)
    .map(
      (d) =>
        `${d.id}:${d.bounds.x},${d.bounds.y},${d.bounds.width},${d.bounds.height}`,
    )
    .join('|');
}

export function isLayoutStateVisibleOnSomeDisplay(state: LayoutState): boolean {
  const rect: Electron.Rectangle = {
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
  };
  return screen.getAllDisplays().some((d) => rectanglesIntersect(rect, d.workArea));
}

async function readPersistedFile(): Promise<PersistedFile> {
  try {
    const filePath = path.join(app.getPath('userData'), STATE_FILENAME);
    const raw = await fsPromises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedFile;
    if (parsed.v !== 1 || typeof parsed.layouts !== 'object' || parsed.layouts === null) {
      throw new Error('invalid window state file');
    }
    return parsed;
  } catch {
    return { v: 1, layouts: {} };
  }
}

export async function loadWindowLayoutState(): Promise<void> {
  persisted = await readPersistedFile();
}

function captureWindowLayout(win: BrowserWindow): LayoutState {
  const isMaximized = win.isMaximized();
  const isFullScreen = win.isFullScreen();
  const b = isMaximized || isFullScreen ? win.getNormalBounds() : win.getBounds();
  return {
    x: b.x,
    y: b.y,
    width: Math.max(MIN_WIN_WIDTH, b.width),
    height: Math.max(MIN_WIN_HEIGHT, b.height),
    isMaximized,
    isFullScreen,
  };
}

async function flushPersistAsync(fp: string, state: LayoutState): Promise<void> {
  persisted.layouts[fp] = state;
  const filePath = path.join(app.getPath('userData'), STATE_FILENAME);
  await fsPromises.writeFile(filePath, JSON.stringify(persisted, null, 2), 'utf-8');
}

function flushPersistSync(fp: string, state: LayoutState): void {
  persisted.layouts[fp] = state;
  const filePath = path.join(app.getPath('userData'), STATE_FILENAME);
  fs.writeFileSync(filePath, JSON.stringify(persisted, null, 2), 'utf-8');
}

function scheduleDebouncedPersist(win: BrowserWindow): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (win.isDestroyed()) return;
    const fp = getDisplayLayoutFingerprint();
    const state = captureWindowLayout(win);
    void flushPersistAsync(fp, state);
    trackedFingerprint = fp;
  }, DEBOUNCE_MS);
}

function applySavedLayout(win: BrowserWindow, state: LayoutState): void {
  if (state.isFullScreen) {
    win.setFullScreen(false);
    win.setBounds({
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
    });
    win.setFullScreen(true);
    return;
  }

  win.setFullScreen(false);
  win.setBounds({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
  });
  if (state.isMaximized) {
    win.maximize();
  }
}

export type InitialWindowPlacement =
  | {
      kind: 'saved';
      state: LayoutState;
    }
  | {
      kind: 'default';
      width: number;
      height: number;
    };

export function resolveInitialWindowPlacement(): InitialWindowPlacement {
  const fp = getDisplayLayoutFingerprint();
  trackedFingerprint = fp;
  const saved = persisted.layouts[fp];
  if (saved && isLayoutStateVisibleOnSomeDisplay(saved)) {
    return { kind: 'saved', state: saved };
  }
  return { kind: 'default', width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

/**
 * Persist move/resize/fullscreen, react to display topology changes (restore layout
 * when a remembered multi-monitor fingerprint returns), and save on close.
 */
export function attachMainWindowLayoutPersistence(win: BrowserWindow): void {
  trackedFingerprint = getDisplayLayoutFingerprint();

  const onDisplayTopologyChange = (): void => {
    if (win.isDestroyed()) return;
    const newFp = getDisplayLayoutFingerprint();

    if (trackedFingerprint !== null && newFp !== trackedFingerprint) {
      trackedFingerprint = newFp;
      const incoming = persisted.layouts[newFp];
      if (incoming && isLayoutStateVisibleOnSomeDisplay(incoming)) {
        applySavedLayout(win, incoming);
      }
      return;
    }

    trackedFingerprint = newFp;
    scheduleDebouncedPersist(win);
  };

  screen.on('display-added', onDisplayTopologyChange);
  screen.on('display-removed', onDisplayTopologyChange);
  screen.on('display-metrics-changed', onDisplayTopologyChange);

  const persistGeom = () => {
    if (!win.isDestroyed()) scheduleDebouncedPersist(win);
  };

  win.on('move', persistGeom);
  win.on('resize', persistGeom);
  win.on('maximize', persistGeom);
  win.on('unmaximize', persistGeom);
  win.on('enter-full-screen', persistGeom);
  win.on('leave-full-screen', persistGeom);

  win.on('close', () => {
    if (win.isDestroyed()) return;
    try {
      flushPersistSync(getDisplayLayoutFingerprint(), captureWindowLayout(win));
    } catch (err) {
      console.error('[window-state] Failed to save on close:', err);
    }
  });

  win.on('closed', () => {
    screen.removeListener('display-added', onDisplayTopologyChange);
    screen.removeListener('display-removed', onDisplayTopologyChange);
    screen.removeListener('display-metrics-changed', onDisplayTopologyChange);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  });
}

/**
 * Called when the user lands on the web app home route — persists current geometry
 * if it changed (crash-safe supplement to close saves).
 */
export function saveMainWindowLayoutIfChanged(): void {
  const win = runtime.mainWindow;
  if (!win || win.isDestroyed()) return;

  const fp = getDisplayLayoutFingerprint();
  const state = captureWindowLayout(win);
  const prev = persisted.layouts[fp];
  const changed
    = prev == null
    || prev.x !== state.x
    || prev.y !== state.y
    || prev.width !== state.width
    || prev.height !== state.height
    || prev.isMaximized !== state.isMaximized
    || prev.isFullScreen !== state.isFullScreen;

  if (changed) {
    void flushPersistAsync(fp, state);
    trackedFingerprint = fp;
  }
}

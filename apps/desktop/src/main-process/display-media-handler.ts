import { BrowserWindow, desktopCapturer, ipcMain, session } from 'electron';
import path from 'path';
import { runtime } from './runtime';

interface SourceInfo {
  id: string;
  name: string;
  thumbnail: string;
}

let pickerWindow: BrowserWindow | null = null;

function showSourcePicker(sources: SourceInfo[]): Promise<string | null> {
  return new Promise((resolve) => {
    const parent = runtime.mainWindow && !runtime.mainWindow.isDestroyed()
      ? runtime.mainWindow
      : undefined;

    pickerWindow = new BrowserWindow({
      width: 680,
      height: 500,
      parent,
      modal: !!parent,
      resizable: false,
      autoHideMenuBar: true,
      title: 'Share your screen',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, '../preload/screen-picker-preload.cjs'),
      },
    });

    const handleGetSources = () => sources;
    const handleSelect = (_event: Electron.IpcMainInvokeEvent, sourceId: string) => {
      resolve(sourceId);
      pickerWindow?.close();
    };

    ipcMain.handle('screen-picker:get-sources', handleGetSources);
    ipcMain.handle('screen-picker:select', handleSelect);

    pickerWindow.on('closed', () => {
      ipcMain.removeHandler('screen-picker:get-sources');
      ipcMain.removeHandler('screen-picker:select');
      pickerWindow = null;
      resolve(null);
    });

    pickerWindow.loadFile(path.join(__dirname, 'screen-picker.html'));
  });
}

export function registerDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });

      if (sources.length === 0) {
        callback(null);
        return;
      }

      const screens = sources.filter((s) => s.id.startsWith('screen:'));
      if (screens.length === 1 && sources.length === 1) {
        callback({ video: screens[0] });
        return;
      }

      const sourceInfos: SourceInfo[] = sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
      }));

      const selectedId = await showSourcePicker(sourceInfos);
      if (!selectedId) {
        callback(null);
        return;
      }

      const selected = sources.find((s) => s.id === selectedId);
      callback(selected ? { video: selected } : null);
    },
    { useSystemPicker: true },
  );
}

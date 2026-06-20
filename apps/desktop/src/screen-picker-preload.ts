import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('screenPicker', {
  getSources: () => ipcRenderer.invoke('screen-picker:get-sources'),
  select: (sourceId: string) => ipcRenderer.invoke('screen-picker:select', sourceId),
});

// Peek's bridge (window.peek): config, lid angle, Presage (native capture in the main process), run files.

import { contextBridge, ipcRenderer } from 'electron';
import type { NativeCamera, PresageEvent } from '../main/presage';
import type { PeekConfig } from '../shared/types';

const api = {
  config: (): Promise<PeekConfig> => ipcRenderer.invoke('peek:config'),
  onLid: (cb: (deg: number) => void) => {
    ipcRenderer.on('peek:lid', (_e, deg: number) => cb(deg));
  },
  presage: {
    cameras: (): Promise<NativeCamera[]> => ipcRenderer.invoke('peek:presage:cameras'),
    start: (cameraId: string): Promise<void> => ipcRenderer.invoke('peek:presage:start', cameraId),
    stop: (): Promise<void> => ipcRenderer.invoke('peek:presage:stop'),
    onEvent: (cb: (e: PresageEvent) => void) => {
      ipcRenderer.on('peek:presage', (_e, ev: PresageEvent) => cb(ev));
    },
  },
  saveRun: (jsonl: string): Promise<string> => ipcRenderer.invoke('peek:saveRun', jsonl),
  deleteRuns: (): Promise<number> => ipcRenderer.invoke('peek:deleteRuns'),
  showRuns: (): Promise<void> => ipcRenderer.invoke('peek:showRuns'),
  quit: (): Promise<void> => ipcRenderer.invoke('peek:quit'),
};

contextBridge.exposeInMainWorld('peek', api);

export type PeekApi = typeof api;

// One preload for two bridges:
//  1. Presage's own bridge (window.__smartspectraBridge) used by @smartspectra/node-sdk/renderer.
//  2. Peek's bridge (window.peek): lid angle, config, run files.

import { contextBridge, ipcRenderer } from 'electron';
import '@smartspectra/node-sdk/preload';
import type { PeekConfig } from '../shared/types';

const api = {
  config: (): Promise<PeekConfig> => ipcRenderer.invoke('peek:config'),
  onLid: (cb: (deg: number) => void) => {
    ipcRenderer.on('peek:lid', (_e, deg: number) => cb(deg));
  },
  saveRun: (jsonl: string): Promise<string> => ipcRenderer.invoke('peek:saveRun', jsonl),
  deleteRuns: (): Promise<number> => ipcRenderer.invoke('peek:deleteRuns'),
  showRuns: (): Promise<void> => ipcRenderer.invoke('peek:showRuns'),
  quit: (): Promise<void> => ipcRenderer.invoke('peek:quit'),
};

contextBridge.exposeInMainWorld('peek', api);

export type PeekApi = typeof api;

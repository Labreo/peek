// Electron main process: window, Presage IPC bridge, lid sensor, run files, config.

import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PeekConfig } from '../shared/types';
import { startLid, type LidReader } from './lid';
import { deleteRuns, runsDir, saveRun } from './recorder';

// The SDK's main-process half. Frames from the renderer are processed natively here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { bindSmartSpectraIpc } = require('@smartspectra/node-sdk/main');

const ROOT = resolve(__dirname, '..');
const argv = process.argv.slice(1);
const flag = (name: string) => argv.includes(name);

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function replayArg(): PeekConfig['replay'] {
  const i = argv.indexOf('--replay');
  if (i < 0) return null;
  const next = argv[i + 1];
  const path = resolve(ROOT, next && !next.startsWith('--') ? next : 'replays/sample-run.jsonl');
  return { path, text: readFileSync(path, 'utf8') };
}

let win: BrowserWindow | null = null;
let lid: LidReader | null = null;

function createWindow(config: PeekConfig) {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    title: 'Peek',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required', // replay mode starts audio without a click
    },
  });
  bindSmartSpectraIpc(win);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(join(__dirname, 'index.html'));
  // Dev aid: PEEK_SNAP=<dir> saves a screenshot of the window every 3 s.
  const snapDir = process.env.PEEK_SNAP;
  if (snapDir) {
    win.webContents.on('console-message', (e) => console.log('[renderer]', (e as unknown as { message: string }).message));
    let n = 0;
    setInterval(async () => {
      const img = await win?.webContents.capturePage();
      if (img) writeFileSync(join(snapDir, `snap-${String(n++).padStart(3, '0')}.png`), img.toPNG());
    }, 3000);
  }
  if (flag('--devtools')) win.webContents.openDevTools({ mode: 'detach' });

  lid = startLid((deg) => win?.webContents.send('peek:lid', deg), flag('--sim-lid') || !!config.replay);
  config.lidSource = lid.source;
  config.lidError = lid.error;
}

app.whenReady().then(() => {
  const env = { ...loadEnv(), ...process.env };
  const config: PeekConfig = {
    apiKey: env.PRESAGE_API_KEY || null,
    replay: replayArg(),
    debug: flag('--debug') || flag('--replay'),
    lidSource: 'simulator',
    lidError: null,
    version: app.getVersion(),
  };

  // Camera only, video only, only for our own bundled page. No microphone.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    const url = (details as { requestingUrl?: string }).requestingUrl || wc.getURL() || '';
    const types = (details as { mediaTypes?: string[] }).mediaTypes || [];
    cb(permission === 'media' && types.length === 1 && types[0] === 'video' && url.startsWith('file://'));
  });

  ipcMain.handle('peek:config', () => config);
  ipcMain.handle('peek:saveRun', (_e, jsonl: string) => saveRun(String(jsonl)));
  ipcMain.handle('peek:deleteRuns', () => deleteRuns());
  ipcMain.handle('peek:showRuns', () => shell.openPath(runsDir()));
  ipcMain.handle('peek:quit', () => app.quit());

  createWindow(config);
});

app.on('window-all-closed', () => {
  lid?.stop();
  app.quit(); // quitting clears every reading held in memory
});

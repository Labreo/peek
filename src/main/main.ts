// Electron main process: window, Presage (native capture), lid sensor, run files, config.

import { app, BrowserWindow, ipcMain, powerSaveBlocker, session, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PeekConfig } from '../shared/types';
import { startLid, type LidReader } from './lid';
import { listNativeCameras, NativePresage } from './presage';
import { deleteRuns, runsDir, saveRun } from './recorder';

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
let presage: NativePresage | null = null;

function createWindow(config: PeekConfig) {
  // Dev aid: PEEK_SIZE=960x600 sets the window size (for recording GIFs).
  const [w, h] = (process.env.PEEK_SIZE || '1280x800').split('x').map(Number);
  win = new BrowserWindow({
    width: w || 1280,
    height: h || 800,
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
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(join(__dirname, 'index.html'));
  // Dev aid: PEEK_SNAP=<dir> saves a screenshot every PEEK_SNAP_MS (default 3000 ms).
  const snapDir = process.env.PEEK_SNAP;
  if (snapDir) {
    win.webContents.on('console-message', (e) => console.log('[renderer]', (e as unknown as { message: string }).message));
    let n = 0;
    setInterval(async () => {
      const img = await win?.webContents.capturePage();
      if (img) writeFileSync(join(snapDir, `snap-${String(n++).padStart(3, '0')}.png`), img.toPNG());
    }, Number(process.env.PEEK_SNAP_MS) || 3000);
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
    debug: flag('--peek-debug') || flag('--replay') || flag('--presenter'),
    presenter: flag('--presenter'),
    preview: !flag('--no-preview'),
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
  ipcMain.handle('peek:presage:cameras', () => listNativeCameras());
  ipcMain.handle('peek:presage:start', (_e, cameraId: string) => {
    if (!config.apiKey) return;
    presage ??= new NativePresage(config.apiKey, () => win);
    return presage.start(String(cameraId));
  });
  ipcMain.handle('peek:presage:stop', () => presage?.stop());
  ipcMain.handle('peek:saveRun', (_e, jsonl: string) => saveRun(String(jsonl)));
  ipcMain.handle('peek:deleteRuns', () => deleteRuns());
  ipcMain.handle('peek:showRuns', () => shell.openPath(runsDir()));
  ipcMain.handle('peek:quit', () => app.quit());

  // Play needs no keyboard or mouse, so keep the display awake while Peek is open.
  powerSaveBlocker.start('prevent-display-sleep');

  createWindow(config);
});

app.on('window-all-closed', async () => {
  lid?.stop();
  await presage?.stop();
  app.quit(); // quitting clears every reading held in memory
});

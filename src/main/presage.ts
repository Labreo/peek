// SmartSpectra SDK, native capture in the main process.
//
// Why here and not in the renderer: the renderer helper copies every camera frame from the
// window to the main process over IPC. On a MacBook Air with the 3D scene running, that path
// fell below Presage's minimum frame rate (error 14). Presage's own docs recommend main-process
// capture for performance. Here the SDK opens the camera itself (AVFoundation), so frames never
// cross a process boundary. Metrics packets (small protobuf buffers) are forwarded to the window,
// which decodes them into signal-bus events.

import type { BrowserWindow } from 'electron';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ss = require('@smartspectra/node-sdk') as typeof import('@smartspectra/node-sdk');

// EXPRESSIONS drives a cosmetic effect only (P2). Set to false if the frame rate suffers.
export const USE_EXPRESSIONS = true;
const REQUESTED_METRICS = [
  ...ss.breathingMetrics, ss.MetricType.PULSE_RATE, ss.MetricType.BLINKING,
  ...(USE_EXPRESSIONS ? [ss.MetricType.EXPRESSIONS] : []),
];

export interface NativeCamera { id: string; name: string; }

export type PresageEvent =
  | { type: 'status'; status: number }
  | { type: 'validation'; code: number }
  | { type: 'error'; code: number; message: string; retryable: boolean }
  | { type: 'metrics'; buf: Uint8Array; ts: number };

/** Cameras the SDK can open, the phone (USB webcam) first. */
export function listNativeCameras(): NativeCamera[] {
  let cams: { id: string; name: string | null }[] = [];
  try { cams = ss.SmartSpectraSDK.availableCameras(); } catch { return []; }
  const score = (n: string) => (/pixel|android|webcam|uvc/i.test(n) && !/facetime|obs|virtual/i.test(n) ? 0 : /facetime/i.test(n) ? 1 : 2);
  return cams
    .map((c) => ({ id: c.id, name: c.name ?? 'Camera' }))
    .sort((a, b) => score(a.name) - score(b.name));
}

export class NativePresage {
  private sdk: InstanceType<typeof ss.SmartSpectraSDK> | null = null;
  private busy: Promise<void> = Promise.resolve();

  constructor(private apiKey: string, private win: () => BrowserWindow | null) {}

  private send(e: PresageEvent) {
    const w = this.win();
    if (w && !w.isDestroyed()) w.webContents.send('peek:presage', e);
  }

  /** Start (or restart) measuring from a camera. Serialized so a stop always finishes first. */
  start(cameraId: string): Promise<void> {
    this.busy = this.busy.then(async () => {
      await this.teardown();
      const sdk = new ss.SmartSpectraSDK({
        apiKey: this.apiKey,
        requestedMetrics: REQUESTED_METRICS,
        enableTelemetry: false, // Peek opts out of Presage's optional SDK telemetry.
      });
      this.sdk = sdk;
      sdk.on('processingStatus', (status) => this.send({ type: 'status', status }));
      sdk.on('validationStatus', (code) => this.send({ type: 'validation', code }));
      sdk.on('error', (code, message, retryable) => this.send({ type: 'error', code, message, retryable }));
      sdk.on('metrics', (buf, ts) => this.send({ type: 'metrics', buf: new Uint8Array(buf), ts }));
      sdk.useCamera(ss.CameraSelection.byId(cameraId), { width: 1280, height: 720, fps: 30 });
      sdk.start();
    }).catch((e: Error & { code?: number; retryable?: boolean }) => {
      this.send({ type: 'error', code: e.code ?? -1, message: e.message, retryable: e.retryable ?? true });
    });
    return this.busy;
  }

  stop(): Promise<void> {
    this.busy = this.busy.then(() => this.teardown());
    return this.busy;
  }

  private async teardown() {
    const sdk = this.sdk;
    this.sdk = null;
    if (!sdk) return;
    try { await sdk.stopAsync(); } catch { /* already stopped or in error */ }
    try { await sdk.destroy(); } catch { /* ignore */ }
  }
}

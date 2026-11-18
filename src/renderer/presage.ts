// SmartSpectra SDK wrapper (PEEK_PLAN.md Section 9).
// The renderer SDK streams camera frames to the main-process SDK over IPC, where the
// native pipeline runs on this computer. We hand it a MediaStream from the camera the
// player picked (normally the Pixel in USB webcam mode) and turn each metrics packet
// into RawEvents for the signal bus.

import {
  SmartSpectraSDK,
  ProcessingStatus,
  ValidationCode,
  MetricType,
  breathingMetrics,
} from '@smartspectra/node-sdk/renderer';
import { decodeMetrics } from '@smartspectra/node-sdk/messages';
import type { FaceStatus, RawEvent } from '../shared/types';

// EXPRESSIONS drives a cosmetic effect only (P2). Set to false if the frame rate suffers.
export const USE_EXPRESSIONS = true;
export const REQUESTED_METRICS = [
  ...breathingMetrics, MetricType.PULSE_RATE, MetricType.BLINKING,
  ...(USE_EXPRESSIONS ? [MetricType.EXPRESSIONS] : []),
];
// ExpressionType values from the SDK protobuf.
const EXPR_FEAR = 4;
const EXPR_SURPRISE = 8;

const VALIDATION_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ValidationCode).map(([k, v]) => [v as number, k.replace(/^k/, '')]),
);

export function faceStatusFor(code: number): FaceStatus {
  switch (code) {
    case ValidationCode.kOk: return 'ok';
    case ValidationCode.kNoFaceFound: return 'no_face';
    case ValidationCode.kTooDark:
    case ValidationCode.kTooBright: return 'bad_light';
    case ValidationCode.kExcessiveMotion: return 'moving';
    case ValidationCode.kCameraTuning: return 'warming_up';
    default: return 'adjust';
  }
}

export function validationHint(code: number): string {
  switch (code) {
    case ValidationCode.kOk: return 'Face found';
    case ValidationCode.kNoFaceFound: return 'No face found. Sit in front of the camera.';
    case ValidationCode.kMultipleFacesFound: return 'More than one face. Peek only measures the player.';
    case ValidationCode.kTooDark: return 'Too dark. Turn on a soft lamp facing you.';
    case ValidationCode.kTooBright: return 'Too bright. Move the lamp away a little.';
    case ValidationCode.kExcessiveMotion: return 'Hold still for a moment.';
    case ValidationCode.kFaceTooClose: return 'Move back a little.';
    case ValidationCode.kFaceTooFar: return 'Move a little closer.';
    case ValidationCode.kFaceNotCentered: return 'Center your face in the camera.';
    case ValidationCode.kFaceNotForward: return 'Face the camera.';
    case ValidationCode.kFaceTooHigh: return 'Lower the camera or sit up.';
    case ValidationCode.kFaceTooLow: return 'Raise the camera a little.';
    case ValidationCode.kFrameRateTooLow: return 'Camera frame rate too low. Try a USB 2.0 cable or more light.';
    case ValidationCode.kCameraTuning: return 'Camera adjusting...';
    default: return VALIDATION_NAMES[code] ?? `Status ${code}`;
  }
}

type Long = { toNumber(): number };
const num = (x: unknown): number =>
  x == null ? 0 : typeof x === 'number' ? x : typeof x === 'bigint' ? Number(x) : (x as Long).toNumber?.() ?? Number(x);

export interface PresageStatus {
  processing: number;
  processingName: string;
  validation: number | null;
  hint: string;
  error: string | null;
  packets: number;
}

export interface CameraChoice { deviceId: string; label: string; }

/** Video inputs, with the phone (USB webcam) sorted first. */
export async function listCameras(): Promise<CameraChoice[]> {
  // Labels are only filled in after one permission grant.
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  const score = (l: string) => (/pixel|android|webcam|uvc/i.test(l) && !/facetime|obs|virtual/i.test(l) ? 0 : /facetime/i.test(l) ? 1 : 2);
  return devs
    .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Camera' }))
    .sort((a, b) => score(a.label) - score(b.label));
}

export class Presage {
  private sdk: SmartSpectraSDK | null = null;
  stream: MediaStream | null = null;
  status: PresageStatus = { processing: 0, processingName: 'Uninitialized', validation: null, hint: 'Starting...', error: null, packets: 0 };
  private lastSdkTs = 0;

  constructor(private apiKey: string, private emit: (e: RawEvent) => void, private now: () => number = () => performance.now()) {}

  async start(deviceId: string | null): Promise<void> {
    await this.stop();
    const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    if (deviceId) video.deviceId = { exact: deviceId };
    this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });

    const sdk = new SmartSpectraSDK({
      apiKey: this.apiKey,
      requestedMetrics: REQUESTED_METRICS,
      enableTelemetry: false, // Peek opts out of Presage's optional SDK telemetry.
    });
    this.sdk = sdk;
    const procNames = Object.fromEntries(Object.entries(ProcessingStatus).map(([k, v]) => [v, k.replace(/^k/, '')]));

    sdk.on('processingStatus', (s) => {
      this.status.processing = s;
      this.status.processingName = procNames[s] ?? String(s);
    });
    sdk.on('validationStatus', (code) => {
      this.status.validation = code;
      this.status.hint = validationHint(code);
      this.emit({ kind: 'face', t: this.now(), status: faceStatusFor(code), code });
    });
    sdk.on('error', (code, message) => {
      this.status.error = `${message} (code ${code})`;
    });
    sdk.on('metrics', (buf) => this.onMetrics(buf));

    // Camera unplugged mid-run: report it and treat it as a lost face so the game pauses.
    this.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      this.status.error = 'Camera disconnected.';
      this.status.hint = 'Camera disconnected. Plug it back in.';
      this.emit({ kind: 'face', t: this.now(), status: 'no_face' });
    });
    this.status.error = null;
    sdk.useMediaStream(this.stream);
    await sdk.start();
  }

  private onMetrics(buf: Uint8Array) {
    this.status.packets++;
    const m = decodeMetrics(buf);
    const now = this.now();

    // Each packet is the slice since the previous one. Map SDK timestamps (us) onto our
    // clock so samples inside one slice keep their real spacing.
    let latest = 0;
    const scan = (arr?: { timestamp?: unknown }[] | null) => arr?.forEach((x) => { latest = Math.max(latest, num(x.timestamp)); });
    scan(m.cardio?.pulseRate); scan(m.breathing?.upperTrace); scan(m.face?.blinking);
    if (!latest) latest = this.lastSdkTs;
    this.lastSdkTs = latest;
    const at = (ts: unknown) => now - Math.max(0, (latest - num(ts)) / 1000);

    for (const p of m.cardio?.pulseRate ?? []) {
      this.emit({ kind: 'pulse', t: at(p.timestamp), bpm: p.value ?? 0, stable: !!p.stable, confidence: p.confidence ?? undefined });
    }
    for (const r of m.breathing?.rate ?? []) {
      this.emit({ kind: 'breathRate', t: at(r.timestamp), bpm: r.value ?? 0, stable: !!r.stable });
    }
    for (const b of m.breathing?.upperTrace ?? []) {
      this.emit({ kind: 'breath', t: at(b.timestamp), value: b.value ?? 0 });
    }
    for (const x of m.face?.expression ?? []) {
      let fear = 0, surprise = 0;
      for (const sc of x.scores ?? []) {
        if (sc.type === EXPR_FEAR) fear = sc.confidence ?? 0;
        if (sc.type === EXPR_SURPRISE) surprise = sc.confidence ?? 0;
      }
      this.emit({ kind: 'expression', t: at(x.timestamp), fear, surprise });
    }
    for (const b of m.face?.blinking ?? []) {
      this.emit({ kind: 'blink', t: at(b.timestamp), detected: !!b.detected });
    }
  }

  async stop(): Promise<void> {
    const sdk = this.sdk;
    this.sdk = null;
    if (sdk) {
      try { await sdk.stop(); } catch { /* not running */ }
      sdk.destroy();
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

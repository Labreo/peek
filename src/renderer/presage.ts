// SmartSpectra, window side (PEEK_PLAN.md Section 9).
// The SDK runs and captures the camera natively in the main process (src/main/presage.ts).
// This class asks it to start, receives its events over IPC, and decodes each metrics packet
// into RawEvents for the signal bus. Peek never opens the sensing camera itself and never asks
// the SDK for video output.

import { ProcessingStatus, ValidationCode } from '@smartspectra/node-sdk/renderer';
import { decodeMetrics } from '@smartspectra/node-sdk/messages';
import type { FaceStatus, RawEvent } from '../shared/types';

// ExpressionType values from the SDK protobuf.
const EXPR_FEAR = 4;
const EXPR_SURPRISE = 8;
const ERR_LOW_FPS = 14;

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
    case ValidationCode.kFrameRateTooLow: return 'Camera frame rate too low. Add light on your face, or check the cable.';
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
  retryable: boolean;
  packets: number;
}

export interface CameraChoice { deviceId: string; label: string; }

/** Cameras the SDK can open natively, the phone (USB webcam) first. deviceId is the SDK camera id. */
export async function listCameras(): Promise<CameraChoice[]> {
  const cams = await window.peek.presage.cameras();
  return cams.map((c) => ({ deviceId: c.id, label: c.name }));
}

const PROC_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ProcessingStatus).map(([k, v]) => [v as number, k.replace(/^k/, '')]),
);

export class Presage {
  status: PresageStatus = { processing: 0, processingName: 'Uninitialized', validation: null, hint: 'Starting...', error: null, retryable: true, packets: 0 };
  private lastSdkTs = 0;
  private listening = false;

  constructor(private emit: (e: RawEvent) => void, private now: () => number = () => performance.now()) {}

  private listen() {
    if (this.listening) return;
    this.listening = true;
    window.peek.presage.onEvent((e) => {
      switch (e.type) {
        case 'status':
          this.status.processing = e.status;
          this.status.processingName = PROC_NAMES[e.status] ?? String(e.status);
          break;
        case 'validation':
          this.status.validation = e.code;
          this.status.hint = validationHint(e.code);
          this.emit({ kind: 'face', t: this.now(), status: faceStatusFor(e.code), code: e.code });
          break;
        case 'error':
          this.status.retryable = e.retryable;
          this.status.error = e.code === ERR_LOW_FPS
            ? 'The camera frame rate dropped too low for Presage. Add light on your face (phones slow down in the dark), check the cable, then press Try again.'
            : `${e.message} (code ${e.code})`;
          this.emit({ kind: 'face', t: this.now(), status: 'no_face' });
          break;
        case 'metrics':
          this.onMetrics(e.buf);
          break;
      }
    });
  }

  /**
   * Start measuring with a native camera (SDK id). Nothing else may open this camera while the SDK
   * runs: a second capture session (even at the same format) breaks the SDK's frame timing (error 11).
   */
  async start(cameraId: string | null): Promise<void> {
    this.listen();
    this.status = { processing: 0, processingName: 'Starting', validation: null, hint: 'Starting...', error: null, retryable: true, packets: 0 };
    if (!cameraId) { this.status.error = 'No camera found.'; return; }
    await window.peek.presage.start(cameraId);
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
    await window.peek.presage.stop();
  }
}

/**
 * Presenter view only: a live view of the player from a *different* camera than the sensing one
 * (normally the MacBook's own FaceTime camera). Displayed on screen, never recorded or sent anywhere.
 */
export async function openPresenterCamera(sensingLabel: string | undefined): Promise<MediaStream | null> {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const others = devs.filter((d) => d.label && (!sensingLabel || !d.label.startsWith(sensingLabel)) && !/obs|virtual/i.test(d.label));
    const pick = others.find((d) => /facetime|built-in/i.test(d.label)) ?? others[0];
    if (!pick) return null;
    return await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: pick.deviceId }, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } },
      audio: false,
    });
  } catch {
    return null;
  }
}

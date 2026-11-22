// Shared data contracts.

export type FaceStatus = 'ok' | 'no_face' | 'bad_light' | 'moving' | 'adjust' | 'warming_up';

export type LidZone = 'open' | 'squint' | 'shut';

/**
 * Raw input events. Everything that drives the game is one of these, so a
 * recorded list of them can be replayed through the same signal bus.
 * `t` is milliseconds on the renderer clock (performance.now()) at receipt.
 */
export type RawEvent =
  | { kind: 'pulse'; t: number; bpm: number; stable: boolean; confidence?: number }
  | { kind: 'breath'; t: number; value: number }
  | { kind: 'breathRate'; t: number; bpm: number; stable: boolean }
  | { kind: 'blink'; t: number; detected: boolean }
  | { kind: 'face'; t: number; status: FaceStatus; code?: number }
  | { kind: 'lid'; t: number; deg: number }
  | { kind: 'expression'; t: number; fear: number; surprise: number };

export interface Calibration {
  openDeg: number;        // the angle the player normally uses
  squintFloorDeg: number; // below this the eyes are shut
  baselineBpm: number | null;
  breathAmp: number | null; // normal peak-to-peak breathing trace amplitude
}

export interface SignalFrame {
  t: number;
  lidDeg: number;
  lidZone: LidZone;
  /** 0 when fully open, 1 at the squint floor. Drives the eyelid overlay. */
  squint: number;
  pulseBpm: number | null;
  pulseDelta: number | null; // pulseBpm - baselineBpm
  breathRate: number | null;
  breathAmp: number | null;  // current rolling peak-to-peak amplitude
  breathHolding: boolean;
  blinkEvent: boolean;       // edge-triggered, true for one frame
  blinkCount: number;
  face: FaceStatus;
  faceLostMs: number;        // how long the face status has not been 'ok'
  startle: number;           // max of fear and surprise expression scores, decays over ~1 s
  startleEvent: boolean;     // edge-triggered when startle crosses the threshold
}

export type LidSource = 'sensor' | 'simulator';

export interface PeekConfig {
  apiKey: string | null;
  replay: { path: string; text: string } | null;
  debug: boolean;
  presenter: boolean;     // start with the presenter view on (npm run demo)
  preview: boolean;       // presenter view may show a second camera (never the sensing one)
  lidSource: LidSource;
  lidError: string | null;
  version: string;
}

export interface RunHeader {
  type: 'header';
  app: 'peek';
  version: string;
  createdAt: string;
  source: 'live' | 'synthetic';
  /** Chapter the recording starts in (default 0). */
  startChapter?: number;
  calibration: Calibration;
  note?: string;
}

/** Things the game logs during a run, used by the debrief chart. */
export type GameEvent =
  | { kind: 'shut'; t: number }
  | { kind: 'blinkStep'; t: number }
  | { kind: 'breathHide'; t: number }
  | { kind: 'blackout'; t: number }
  | { kind: 'clue'; t: number; index: number; chapter?: number }
  | { kind: 'chapter'; t: number; chapter: number }
  | { kind: 'win'; t: number; chapter?: number }
  | { kind: 'lose'; t: number; chapter?: number }
  | { kind: 'panic'; t: number };

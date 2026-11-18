// Merges raw Presage + lid events into one SignalFrame per tick.
// Pure logic, no DOM or Electron, so it runs in the renderer, in replay and in tests.
// See PEEK_PLAN.md Section 6 ("Processing in signalBus.ts").

import type { Calibration, FaceStatus, LidZone, RawEvent, SignalFrame } from './types';

export const BUS = {
  pulseAlpha: 0.3,          // EMA on stable pulse values
  breathWindowMs: 3000,     // rolling window for breathing amplitude
  holdRatio: 0.2,           // holding = amplitude below 20% of normal
  holdMinMs: 1000,          // ...for at least this long (detection lands about 4 s into a hold)
  breathStaleMs: 2500,      // no trace samples for this long = unknown, not holding
  blinkRefractoryMs: 250,
  lidMedianN: 5,
  lidHysteresisDeg: 3,
  startleThreshold: 0.5,
  startleDecayPerS: 1.2,
  openMarginDeg: 10,        // open zone = openDeg - 10 and up
};

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Zone boundaries from calibration (Section 7.4). */
export function zoneEdges(cal: Calibration): { openMin: number; squintMin: number } {
  const openMin = cal.openDeg - BUS.openMarginDeg;
  const squintMin = Math.min(cal.squintFloorDeg, openMin - 5);
  return { openMin, squintMin };
}

/** Zone with hysteresis: leaving the current zone needs crossing the edge by `h` degrees. */
export function nextZone(prev: LidZone, deg: number, cal: Calibration, h = BUS.lidHysteresisDeg): LidZone {
  const { openMin, squintMin } = zoneEdges(cal);
  const raw: LidZone = deg >= openMin ? 'open' : deg >= squintMin ? 'squint' : 'shut';
  if (raw === prev) return prev;
  switch (prev) {
    case 'open':
      if (deg >= openMin - h) return 'open';
      return deg >= squintMin ? 'squint' : 'shut';
    case 'shut':
      if (deg < squintMin + h) return 'shut';
      return deg >= openMin ? 'open' : 'squint';
    case 'squint':
      if (deg >= openMin + h) return 'open';
      if (deg < squintMin - h) return 'shut';
      return 'squint';
  }
}

export function squintAmount(deg: number, cal: Calibration): number {
  const { openMin, squintMin } = zoneEdges(cal);
  const s = (openMin - deg) / Math.max(1, openMin - squintMin);
  return Math.max(0, Math.min(1, s));
}

export class SignalBus {
  cal: Calibration;

  private lidBuf: number[] = [];
  private lidDeg: number;
  private zone: LidZone = 'open';

  private pulseEma: number | null = null;
  private breathRate: number | null = null;
  private breath: { t: number; v: number }[] = [];
  private lowSince: number | null = null;

  private blinkPrev = false;
  private lastBlinkT = -Infinity;
  private pendingBlinks = 0;
  private blinkCount = 0;

  private startle = 0;
  private startleT = 0;
  private startleWasHigh = false;
  private pendingStartle = false;

  private face: FaceStatus = 'warming_up';
  private faceNotOkSince: number | null = null;

  constructor(cal: Calibration) {
    this.cal = cal;
    this.lidDeg = cal.openDeg;
  }

  setCalibration(cal: Calibration) {
    this.cal = cal;
  }

  push(e: RawEvent) {
    switch (e.kind) {
      case 'lid': {
        this.lidBuf.push(e.deg);
        if (this.lidBuf.length > BUS.lidMedianN) this.lidBuf.shift();
        this.lidDeg = median(this.lidBuf);
        this.zone = nextZone(this.zone, this.lidDeg, this.cal);
        break;
      }
      case 'pulse': {
        if (!e.stable || !Number.isFinite(e.bpm) || e.bpm <= 0) break; // hold last stable value
        this.pulseEma = this.pulseEma == null ? e.bpm : BUS.pulseAlpha * e.bpm + (1 - BUS.pulseAlpha) * this.pulseEma;
        if (this.face === 'warming_up') this.setFace('ok', e.t);
        break;
      }
      case 'breathRate':
        if (Number.isFinite(e.bpm) && e.bpm > 0) this.breathRate = e.bpm;
        break;
      case 'breath': {
        this.breath.push({ t: e.t, v: e.value });
        const cutoff = e.t - BUS.breathWindowMs;
        while (this.breath.length && this.breath[0].t < cutoff) this.breath.shift();
        break;
      }
      case 'blink': {
        const rising = e.detected && !this.blinkPrev;
        this.blinkPrev = e.detected;
        if (rising && e.t - this.lastBlinkT >= BUS.blinkRefractoryMs) {
          this.lastBlinkT = e.t;
          this.pendingBlinks++;
          this.blinkCount++;
        }
        break;
      }
      case 'expression': {
        const v = Math.max(e.fear, e.surprise);
        this.startle = Math.max(this.decayedStartle(e.t), v);
        this.startleT = e.t;
        const high = this.startle >= BUS.startleThreshold;
        if (high && !this.startleWasHigh) this.pendingStartle = true;
        this.startleWasHigh = high;
        break;
      }
      case 'face':
        // Stay in warming_up until the first stable pulse, unless something is clearly wrong.
        if (this.face === 'warming_up' && e.status === 'ok') break;
        this.setFace(e.status, e.t);
        break;
    }
  }

  private setFace(s: FaceStatus, t: number) {
    if (s === 'ok') this.faceNotOkSince = null;
    else if (this.faceNotOkSince == null) this.faceNotOkSince = t;
    this.face = s;
  }

  private decayedStartle(now: number): number {
    return Math.max(0, this.startle - (BUS.startleDecayPerS * Math.max(0, now - this.startleT)) / 1000);
  }

  /** Current breathing amplitude over the rolling window, or null if unknown. */
  breathAmplitude(now: number): number | null {
    const recent = this.breath.filter((s) => s.t >= now - BUS.breathWindowMs);
    if (recent.length < 8) return null;
    if (now - recent[recent.length - 1].t > BUS.breathStaleMs) return null;
    // Only trust the window once it spans most of its length.
    if (recent[recent.length - 1].t - recent[0].t < BUS.breathWindowMs * 0.75) return null;
    let lo = Infinity, hi = -Infinity;
    for (const s of recent) { if (s.v < lo) lo = s.v; if (s.v > hi) hi = s.v; }
    return hi - lo;
  }

  tick(now: number): SignalFrame {
    const amp = this.breathAmplitude(now);
    let holding = false;
    const normal = this.cal.breathAmp;
    if (amp != null && normal != null && normal > 0 && amp < BUS.holdRatio * normal) {
      if (this.lowSince == null) this.lowSince = now;
      holding = now - this.lowSince >= BUS.holdMinMs;
    } else {
      this.lowSince = null;
    }

    const startleEvent = this.pendingStartle;
    this.pendingStartle = false;
    const blinkEvent = this.pendingBlinks > 0;
    this.pendingBlinks = 0;

    const pulse = this.pulseEma;
    const base = this.cal.baselineBpm;
    return {
      t: now,
      lidDeg: this.lidDeg,
      lidZone: this.zone,
      squint: squintAmount(this.lidDeg, this.cal),
      pulseBpm: pulse,
      pulseDelta: pulse != null && base != null ? pulse - base : null,
      breathRate: this.breathRate,
      breathAmp: amp,
      breathHolding: holding,
      blinkEvent,
      blinkCount: this.blinkCount,
      face: this.face,
      faceLostMs: this.faceNotOkSince == null ? 0 : now - this.faceNotOkSince,
      startle: this.decayedStartle(now),
      startleEvent,
    };
  }

  /** Recent breathing trace values for the HUD sparkline. */
  breathTrace(): number[] {
    return this.breath.map((s) => s.v);
  }
}

/** Collects the 60 s baseline: median stable pulse and median breathing amplitude. */
export class BaselineRecorder {
  private pulses: number[] = [];
  private amps: number[] = [];
  push(frame: SignalFrame) {
    if (frame.pulseBpm != null) this.pulses.push(frame.pulseBpm);
    if (frame.breathAmp != null) this.amps.push(frame.breathAmp);
  }
  result(): { baselineBpm: number | null; breathAmp: number | null; pulseSamples: number } {
    return {
      baselineBpm: this.pulses.length ? median(this.pulses) : null,
      breathAmp: this.amps.length ? median(this.amps) : null,
      pulseSamples: this.pulses.length,
    };
  }
}

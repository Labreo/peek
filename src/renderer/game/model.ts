// Pure game rules: ghost distance, clues, breath hiding, steady-yourself ending.
// No rendering here, so replay and tests can run it headless.

import type { GameEvent, SignalFrame } from '../../shared/types';
import { TUNING, type Tuning } from './tuning';

export type Phase = 'clues' | 'steady' | 'won' | 'lost';

export interface GameState {
  t: number;              // seconds since PLAY started
  distance: number;
  velocity: number;       // m/s toward the player (negative = retreating)
  phase: Phase;
  cluesFound: number;
  clueProgress: number;   // 0..1 on the current clue
  steadyProgress: number; // 0..1
  holdS: number;          // continuous breath hold time while hiding
  holdCapped: boolean;    // cap reached; needs normal breathing before hiding works again
  breathPrompt: boolean;  // show "Breathe normally"
  watching: boolean;
  lastZone: SignalFrame['lidZone'];
  events: GameEvent[];
}

export function newGame(tune: Tuning = TUNING): GameState {
  return {
    t: 0, distance: tune.startDistance, velocity: 0, phase: 'clues',
    cluesFound: 0, clueProgress: 0, steadyProgress: 0,
    holdS: 0, holdCapped: false, breathPrompt: false, watching: true, lastZone: 'open', events: [],
  };
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Advance the game by dt seconds. Mutates and returns the state. */
export function step(s: GameState, f: SignalFrame, dt: number, tune: Tuning = TUNING, wallMs = f.t): GameState {
  if (s.phase === 'won' || s.phase === 'lost') return s;
  s.t += dt;

  const pulseFactor = f.pulseDelta == null ? 0 : clamp(f.pulseDelta / tune.pulseFullDelta, 0, 1);
  const zone = f.lidZone;
  if (zone === 'shut' && s.lastZone !== 'shut') s.events.push({ kind: 'shut', t: wallMs });
  s.lastZone = zone;

  // Breath hiding with a hard cap so there is never a reason to hold longer than 8 s.
  const canHide = f.breathHolding && s.distance < tune.breathHideRange && !s.holdCapped;
  if (f.breathHolding && zone !== 'shut') s.holdS += dt; else s.holdS = 0;
  if (!f.breathHolding) { s.holdCapped = false; s.breathPrompt = false; }
  if (s.holdS >= tune.breathHoldCapS && !s.holdCapped) {
    s.holdCapped = true;
    s.breathPrompt = true;
    s.distance = Math.max(s.distance, tune.breathCapPushTo); // it leaves anyway
  }

  let v: number;
  if (zone === 'shut') {
    v = tune.shutBase + tune.shutPulseGain * pulseFactor;
  } else if (canHide) {
    v = tune.breathDriftSpeed;
  } else if (zone === 'open' && !f.blinkEvent) {
    v = 0;
  } else {
    v = tune.speedBase + tune.squintPulseGain * pulseFactor;
  }
  s.watching = zone === 'open' && !f.blinkEvent;
  s.velocity = v;

  if (f.blinkEvent && zone !== 'shut') {
    s.distance -= tune.blinkLurch;
    s.events.push({ kind: 'blinkStep', t: wallMs });
  }
  s.distance = clamp(s.distance - v * dt, 0, tune.maxDistance);

  if (canHide && !s.events.some((e) => e.kind === 'breathHide' && wallMs - e.t < 3000)) {
    s.events.push({ kind: 'breathHide', t: wallMs });
  }

  // Clues: readable only while squinting.
  if (s.phase === 'clues') {
    if (zone === 'squint' && f.squint >= tune.clueRevealMin) {
      s.clueProgress += dt / tune.clueReadS;
      if (s.clueProgress >= 1) {
        s.clueProgress = 0;
        s.cluesFound++;
        s.events.push({ kind: 'clue', t: wallMs, index: s.cluesFound - 1 });
        if (s.cluesFound >= tune.clueCount) s.phase = 'steady';
      }
    }
  } else if (s.phase === 'steady') {
    const calm = f.pulseDelta == null ? tune.steadyNoPulseOk : f.pulseDelta <= tune.steadyDeltaBpm;
    if (zone === 'open' && !f.blinkEvent && calm) {
      s.steadyProgress += dt / tune.steadyHoldS;
    } else if (zone !== 'open' || !calm) {
      s.steadyProgress = Math.max(0, s.steadyProgress - dt / tune.steadyHoldS);
    }
    if (s.steadyProgress >= 1) {
      s.phase = 'won';
      s.events.push({ kind: 'win', t: wallMs });
    }
  }

  if (s.distance <= tune.loseDistance && s.phase !== 'won') {
    s.phase = 'lost';
    s.events.push({ kind: 'lose', t: wallMs });
  }
  return s;
}

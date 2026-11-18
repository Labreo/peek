// Pure game rules: ghost distance, clues, breath hiding, lamp blackouts, the steady-yourself ending.
// No rendering here, so replay and tests can run it headless. One GameState = one chapter attempt.

import type { GameEvent, SignalFrame } from '../../shared/types';
import { chapterTuning, TUNING, type Tuning } from './tuning';

export type Phase = 'clues' | 'steady' | 'won' | 'lost';

export interface GameState {
  chapter: number;
  t: number;              // seconds since this chapter started
  distance: number;
  velocity: number;       // m/s toward the player (negative = retreating)
  phase: Phase;
  cluesFound: number;
  clueProgress: number;   // 0..1 on the current clue
  steadyProgress: number; // 0..1
  holdS: number;          // continuous breath hold time
  holdCapped: boolean;    // cap reached; needs normal breathing before hiding works again
  breathPrompt: boolean;  // show "Breathe normally"
  watching: boolean;
  watchS: number;         // seconds of unbroken calm watching
  blackout: boolean;      // the lamp is dead: you cannot watch it
  blackoutWarn: boolean;  // the bulb is buzzing: a blackout is coming
  side: number;           // lateral position in the aisle, -1..1 (chapter 3 relocation)
  shutCount: number;
  lastZone: SignalFrame['lidZone'];
  events: GameEvent[];
}

/** Deterministic lateral spots the Archivist jumps between when it relocates. */
const SIDES = [0, -0.55, 0.5, -0.3, 0.65, -0.6, 0.25];

export function newGame(tuneOrChapter: Tuning | number = TUNING): GameState {
  const chapter = typeof tuneOrChapter === 'number' ? tuneOrChapter : 0;
  const tune = typeof tuneOrChapter === 'number' ? chapterTuning(tuneOrChapter) : tuneOrChapter;
  return {
    chapter, t: 0, distance: tune.startDistance, velocity: 0, phase: 'clues',
    cluesFound: 0, clueProgress: 0, steadyProgress: 0,
    holdS: 0, holdCapped: false, breathPrompt: false, watching: true, watchS: 0,
    blackout: false, blackoutWarn: false, side: 0, shutCount: 0, lastZone: 'open', events: [],
  };
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Blackout schedule as a pure function of chapter time, so replays match exactly. */
export function blackoutAt(t: number, tune: Tuning): { dark: boolean; warn: boolean } {
  if (!tune.blackoutEveryS || t < tune.blackoutFirstS - tune.blackoutWarnS) return { dark: false, warn: false };
  const k = (t - tune.blackoutFirstS + tune.blackoutWarnS) % tune.blackoutEveryS; // 0 at warning start
  return { warn: k < tune.blackoutWarnS, dark: k >= tune.blackoutWarnS && k < tune.blackoutWarnS + tune.blackoutDurS };
}

/** Advance the game by dt seconds. Mutates and returns the state. */
export function step(s: GameState, f: SignalFrame, dt: number, tune: Tuning = chapterTuning(s.chapter), wallMs = f.t): GameState {
  if (s.phase === 'won' || s.phase === 'lost') return s;
  s.t += dt;

  const pulseFactor = f.pulseDelta == null ? 0 : clamp(f.pulseDelta / tune.pulseFullDelta, 0, 1);
  const zone = f.lidZone;
  if (zone === 'shut' && s.lastZone !== 'shut') {
    s.events.push({ kind: 'shut', t: wallMs });
    s.shutCount++;
    if (tune.relocates) s.side = SIDES[s.shutCount % SIDES.length];
  }
  s.lastZone = zone;

  const bo = blackoutAt(s.t, tune);
  if (bo.dark && !s.blackout) s.events.push({ kind: 'blackout', t: wallMs });
  s.blackout = bo.dark;
  s.blackoutWarn = bo.warn;

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
  } else if (zone === 'open' && !f.blinkEvent && !s.blackout) {
    // Frozen while watched. A calm, unbroken gaze slowly pushes it back: it is afraid of being seen.
    const calm = f.pulseDelta == null ? 1 : clamp((tune.watchCalmZero - f.pulseDelta) / (tune.watchCalmZero - tune.watchCalmFull), 0, 1);
    v = s.watchS >= tune.watchRetreatAfterS && s.distance < tune.startDistance ? -tune.watchRetreat * calm : 0;
  } else {
    v = tune.speedBase + tune.squintPulseGain * pulseFactor; // squinting, or the lamp is dead
  }
  s.watching = zone === 'open' && !f.blinkEvent && !s.blackout;
  s.watchS = s.watching ? s.watchS + dt : 0;
  s.velocity = v;

  if (f.blinkEvent && zone !== 'shut') {
    s.distance -= tune.blinkLurch;
    s.events.push({ kind: 'blinkStep', t: wallMs });
  }
  s.distance = clamp(s.distance - v * dt, 0, tune.maxDistance);

  if (canHide && !s.events.some((e) => e.kind === 'breathHide' && wallMs - e.t < 3000)) {
    s.events.push({ kind: 'breathHide', t: wallMs });
  }

  // Clues: readable only while squinting, and not in the dark.
  if (s.phase === 'clues') {
    if (zone === 'squint' && f.squint >= tune.clueRevealMin && !s.blackout) {
      s.clueProgress += dt / tune.clueReadS;
      if (s.clueProgress >= 1) {
        s.clueProgress = 0;
        s.cluesFound++;
        s.events.push({ kind: 'clue', t: wallMs, index: s.cluesFound - 1, chapter: s.chapter });
        if (s.cluesFound >= tune.clueCount) s.phase = 'steady';
      }
    }
  } else if (s.phase === 'steady') {
    const calm = f.pulseDelta == null ? tune.steadyNoPulseOk : f.pulseDelta <= tune.steadyDeltaBpm;
    if (s.watching && calm) {
      s.steadyProgress += dt / tune.steadyHoldS;
    } else if (zone !== 'open' || !calm) {
      s.steadyProgress = Math.max(0, s.steadyProgress - dt / tune.steadyHoldS);
    }
    if (s.steadyProgress >= 1) {
      s.phase = 'won';
      s.events.push({ kind: 'win', t: wallMs, chapter: s.chapter });
    }
  }

  if (s.distance <= tune.loseDistance && s.phase !== 'won') {
    s.phase = 'lost';
    s.events.push({ kind: 'lose', t: wallMs, chapter: s.chapter });
  }
  return s;
}

// Generates replays/sample-run.jsonl: a SYNTHETIC session played by a simple bot through
// the real SignalBus and game model, so replay mode can show all three chapters without
// a camera. Marked source: "synthetic". Replace it with a real recorded run (Save run file
// on the debrief screen) before submitting.
// Run: npm run make:sample

import { writeFileSync } from 'node:fs';
import { nextChapter, parseRun, serializeRun, simulateRun, STEP_MS } from '../src/shared/run';
import { SignalBus } from '../src/shared/signalBus';
import type { Calibration, RawEvent } from '../src/shared/types';
import { newGame, step } from '../src/renderer/game/model';
import { CHAPTERS, chapterTuning } from '../src/renderer/game/tuning';

const cal: Calibration = { openDeg: 112, squintFloorDeg: 58, baselineBpm: 71, breathAmp: 0.9 };
const MAX_MS = 15 * 60 * 1000;

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const bus = new SignalBus(cal);
const events: RawEvent[] = [];
const queue: RawEvent[] = [];
const emit = (e: RawEvent) => queue.push(e);

let game = newGame(0);
let tune = chapterTuning(0);

// Bot body and intentions.
let pulse = 72;
let deg = 112;
let mode: 'watch' | 'squint' | 'shut' | 'hold' = 'watch';
let modeUntil = 3000;
let nextBlink = 2500;
let holdStart = 0;
let dramaShutDone = false;
let lastPulseEmit = -1000;
let phaseBreath = 0;
let cluesAtSquint = 0;

function setMode(m: typeof mode, t: number, durMs: number) {
  mode = m;
  modeUntil = t + durMs;
  if (m === 'hold') holdStart = t;
  if (m === 'squint') cluesAtSquint = game.cluesFound;
}

function decide(t: number) {
  const g = game;
  const close = g.distance < tune.breathHideRange - 0.3;
  if (mode === 'hold' && (t - holdStart > 7500 || g.holdCapped || g.distance > 4.5)) { setMode('watch', t, 3000 + rnd() * 2000); return; }
  if (mode !== 'hold' && close && !g.holdCapped && mode !== 'shut' && t - holdStart > 15000) { setMode('hold', t, 7000); return; }
  if (t < modeUntil) {
    // Stop squinting once a clue is read or it gets too close.
    if (mode === 'squint' && (g.cluesFound > cluesAtSquint || g.distance < 3.4)) setMode('watch', t, 4000 + rnd() * 5000);
    return;
  }
  if (g.phase === 'steady') { setMode('watch', t, 2000); return; }
  if (g.blackout || g.blackoutWarn) { setMode('watch', t, 1500); return; }
  // Once per chapter, panic and shut the eyes for a few seconds (the scary part of the demo).
  if (!dramaShutDone && g.cluesFound >= 1 && g.distance > 6) { dramaShutDone = true; setMode('shut', t, 2500 + rnd() * 1500); return; }
  // Watch longer when it is close, so a calm gaze pushes it back before the next read.
  if (g.distance > 5) setMode('squint', t, tune.clueReadS * 1000 + 600 + rnd() * 800);
  else setMode('watch', t, 5000 + rnd() * 4000);
}

let t = 0;
while (t < MAX_MS) {
  t += STEP_MS;
  const tt = Math.floor(t * 10) / 10; // never rounds past this tick when serialized

  decide(t);

  // Lid moves smoothly toward the target, like a hand.
  const target = mode === 'squint' ? 78 + rnd() * 4 : mode === 'shut' ? 22 : 112;
  deg += (target - deg) * 0.25;
  emit({ kind: 'lid', t: tt, deg: Math.round(deg + (rnd() - 0.5) * 1.5) });

  // Pulse drifts toward a target set by what is happening.
  let pt = 74 + game.chapter * 2;
  if (mode === 'shut') pt += 18;
  if (game.distance < 3) pt += 8;
  if (game.blackout) pt += 6;
  if (game.phase === 'steady') pt = 69;
  pulse += ((pt - pulse) * (STEP_MS / 1000)) / 5;
  if (t - lastPulseEmit >= 1000) {
    lastPulseEmit = t;
    emit({ kind: 'pulse', t: tt, bpm: Math.round((pulse + (rnd() - 0.5) * 1.5) * 10) / 10, stable: true, confidence: 0.9 });
    emit({ kind: 'breathRate', t: tt, bpm: mode === 'hold' ? 3 : 14, stable: true });
  }

  // Breathing trace; flat while holding.
  phaseBreath += (STEP_MS / 1000) * (14 / 60) * 2 * Math.PI;
  const amp = mode === 'hold' && t - holdStart > 500 ? 0.03 : 0.45;
  emit({ kind: 'breath', t: tt, value: amp * Math.sin(phaseBreath) + (rnd() - 0.5) * 0.02 });

  // Blinks: less often while squinting, none with the eyes shut.
  if (t >= nextBlink && mode !== 'shut') {
    emit({ kind: 'blink', t: tt, detected: true });
    queue.push({ kind: 'blink', t: Math.floor((t + 150) * 10) / 10, detected: false });
    nextBlink = t + (mode === 'squint' ? 6000 : 3000) + rnd() * 3500;
  }
  // A startled face now and then when it is close (drives the cosmetic lamp stutter).
  if (game.distance < 3 && rnd() < 0.004) emit({ kind: 'expression', t: tt, fear: 0.75, surprise: 0.4 });
  else if (Math.round(t) % 500 < STEP_MS) emit({ kind: 'expression', t: tt, fear: 0.05, surprise: 0.05 });
  if (t < 40) emit({ kind: 'face', t: tt, status: 'ok', code: 0 });

  // Deliver due events, tick the bus and the game exactly like simulateRun does.
  queue.sort((a, b) => a.t - b.t);
  while (queue.length && queue[0].t <= t) { const e = queue.shift()!; bus.push(e); events.push(e); }
  const f = bus.tick(t);
  step(game, f, STEP_MS / 1000, tune, t);
  if (process.env.TRACE && game.chapter === Number(process.env.TRACE) && Math.round(t) % 2000 < STEP_MS && t < 400000) console.log(`${(game.t).toFixed(0)}s ${mode} d=${game.distance.toFixed(2)} v=${game.velocity.toFixed(2)} pd=${f.pulseDelta?.toFixed(1)} zone=${f.lidZone} hold=${f.breathHolding} bo=${game.blackout} clues=${game.cluesFound} p=${game.clueProgress.toFixed(2)}`);
  if (game.phase === 'won' || game.phase === 'lost') {
    const next = nextChapter(game);
    console.log(`chapter ${game.chapter + 1} ${game.phase} at ${(t / 1000).toFixed(0)} s (clues ${game.cluesFound})`);
    if (next == null) break;
    game = newGame(next);
    tune = chapterTuning(next);
    dramaShutDone = false;
    setMode('watch', t, 3000);
  }
}

const text = serializeRun({
  type: 'header', app: 'peek', version: '0.2.0', createdAt: new Date().toISOString(), source: 'synthetic', calibration: cal,
  startChapter: 0, note: 'Synthetic session played by a scripted bot through the real signal bus and game model. Not a real recording.',
}, events);
writeFileSync('replays/sample-run.jsonl', text);
const r = simulateRun(parseRun(text));
console.log(`wrote ${events.length} events, ${(events[events.length - 1].t / 60000).toFixed(1)} min. Replay check: cleared=${r.cleared}/${CHAPTERS.length} finished=${r.finished} time=${(r.timeS / 60).toFixed(1)} min`);

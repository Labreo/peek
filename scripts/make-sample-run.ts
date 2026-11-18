// Generates replays/sample-run.jsonl: a scripted SYNTHETIC run so replay mode works
// without a camera. Marked source: "synthetic" in the header. Replace it with a real
// recorded run (Save run file on the debrief screen) before submitting.
// Run: npm run make:sample

import { writeFileSync } from 'node:fs';
import { serializeRun, simulateRun, parseRun } from '../src/shared/run';
import type { Calibration, RawEvent } from '../src/shared/types';

const cal: Calibration = { openDeg: 112, squintFloorDeg: 58, baselineBpm: 71, breathAmp: 0.9 };

// [startS, endS, lidDeg, targetPulse, holdingBreath]
const script: [number, number, number, number, boolean][] = [
  [0, 9, 112, 73, false],
  [9, 12.2, 80, 75, false],  // squint: clue 1
  [12.2, 22, 111, 76, false],
  [22, 26, 25, 90, false],   // eyes shut, it rushes
  [26, 34, 113, 88, false],
  [34, 37.2, 78, 86, false], // squint: clue 2
  [37.2, 44, 110, 84, false],
  [44, 48, 75, 85, false],   // squint: clue 3, it creeps closer
  [48, 58, 112, 83, true],   // it is close: hold breath
  [58, 100, 112, 69, false], // steady yourself
];

const events: RawEvent[] = [];
let pulse = 72;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
let nextBlink = 3;

for (let t = 0; t < 100; t += 1 / 30) {
  const seg = script.find(([a, b]) => t >= a && t < b)!;
  const [, , deg, target, holding] = seg;
  const ms = t * 1000;
  // Lid at 30 Hz with a little sensor noise, eased between segments.
  events.push({ kind: 'lid', t: ms, deg: Math.round(deg + (rnd() - 0.5) * 2) });
  // Breathing trace at 30 Hz, about 14 breaths a minute. Flat while holding (after a short lag).
  const amp = holding && t - seg[0] > 1 ? 0.04 : 0.45;
  events.push({ kind: 'breath', t: ms, value: amp * Math.sin(t * 2 * Math.PI * (14 / 60)) + (rnd() - 0.5) * 0.02 });
  // Pulse about once a second, drifting toward the segment target.
  if (Math.abs(t - Math.round(t)) < 1 / 60) {
    pulse += (target - pulse) * 0.25 + (rnd() - 0.5) * 1.2;
    events.push({ kind: 'pulse', t: ms, bpm: Math.round(pulse * 10) / 10, stable: true, confidence: 0.9 });
    events.push({ kind: 'breathRate', t: ms, bpm: holding ? 4 : 14, stable: true });
  }
  // Blinks every 3 to 6 s while the eyes are open.
  if (t >= nextBlink && deg > 60) {
    events.push({ kind: 'blink', t: ms, detected: true });
    events.push({ kind: 'blink', t: ms + 150, detected: false });
    nextBlink = t + 5 + rnd() * 4;
  }
  if (t === 0) events.push({ kind: 'face', t: 0, status: 'ok', code: 0 });
}

const text = serializeRun({
  type: 'header', app: 'peek', version: '0.1.0', createdAt: new Date().toISOString(), source: 'synthetic', calibration: cal,
  note: 'Scripted synthetic run for replay mode. Not a real recording.',
}, events);
writeFileSync('replays/sample-run.jsonl', text);
const g = simulateRun(parseRun(text));
console.log(`wrote ${events.length} events; outcome=${g.phase} clues=${g.cluesFound} distance=${g.distance.toFixed(2)} t=${g.t.toFixed(1)}s`);
console.log(g.events.filter((e) => e.kind !== 'blinkStep').map((e) => `${e.kind}@${(e.t / 1000).toFixed(1)}`).join(' '));

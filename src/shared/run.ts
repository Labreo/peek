// Run files: JSONL with one header line, then one RawEvent per line.
// Event times are milliseconds since PLAY started. Replaying a file pushes the same
// events through the same SignalBus and game model, at a fixed 30 Hz step.

import { SignalBus } from './signalBus';
import type { Calibration, RawEvent, RunHeader } from './types';
import { newGame, step, type GameState } from '../renderer/game/model';

export const STEP_MS = 1000 / 30;

export interface Run {
  header: RunHeader;
  events: RawEvent[];
}

export function serializeRun(header: RunHeader, events: RawEvent[]): string {
  const lines = [JSON.stringify(header)];
  for (const e of events) lines.push(JSON.stringify({ ...e, t: Math.round(e.t * 10) / 10 }));
  return lines.join('\n') + '\n';
}

export function parseRun(text: string): Run {
  const lines = text.split('\n').filter((l) => l.trim());
  const header = JSON.parse(lines[0]) as RunHeader;
  if (header.type !== 'header' || header.app !== 'peek') throw new Error('Not a Peek run file');
  const events = lines.slice(1).map((l) => JSON.parse(l) as RawEvent).sort((a, b) => a.t - b.t);
  return { header, events };
}

/** Feeds events into the bus as simulated time passes. */
export class ReplayFeeder {
  private i = 0;
  constructor(private events: RawEvent[], private bus: SignalBus, private offset = 0) {}
  feedUntil(tRel: number) {
    while (this.i < this.events.length && this.events[this.i].t <= tRel) {
      const e = this.events[this.i++];
      this.bus.push({ ...e, t: e.t + this.offset });
    }
  }
  get done() { return this.i >= this.events.length; }
  get duration() { return this.events.length ? this.events[this.events.length - 1].t : 0; }
}

/** Headless run: same bus, same model, fixed step. Used by tests and to sanity check files. */
export function simulateRun(run: Run, cal: Calibration = run.header.calibration): GameState {
  const bus = new SignalBus(cal);
  const feeder = new ReplayFeeder(run.events, bus);
  const game = newGame();
  let t = 0;
  const end = feeder.duration + 5000;
  while (t < end && game.phase !== 'won' && game.phase !== 'lost') {
    t += STEP_MS;
    feeder.feedUntil(t);
    const f = bus.tick(t);
    if (f.faceLostMs > 3000) continue; // paused, same as the live game
    step(game, f, STEP_MS / 1000, undefined, t);
  }
  return game;
}

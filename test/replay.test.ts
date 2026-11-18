import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRun, serializeRun, simulateRun } from '../src/shared/run';
import { CHAPTERS } from '../src/renderer/game/tuning';

const text = readFileSync('replays/sample-run.jsonl', 'utf8');

describe('replay', () => {
  it('produces the same outcome every time', () => {
    const a = simulateRun(parseRun(text));
    const b = simulateRun(parseRun(text));
    expect(a.cleared).toBe(b.cleared);
    expect(a.timeS).toBe(b.timeS);
    expect(a.game.distance).toBe(b.game.distance);
    expect(a.events.map((e) => e.kind)).toEqual(b.events.map((e) => e.kind));
  });

  it('round-trips through serialize and parse', () => {
    const run = parseRun(text);
    const again = parseRun(serializeRun(run.header, run.events));
    expect(again.events.length).toBe(run.events.length);
    expect(simulateRun(again).cleared).toBe(simulateRun(run).cleared);
  });

  it('the sample session plays through every chapter', () => {
    const r = simulateRun(parseRun(text));
    expect(r.cleared).toBe(CHAPTERS.length);
    expect(r.finished).toBe(true);
    const clues = r.events.filter((e) => e.kind === 'clue').length;
    expect(clues).toBeGreaterThanOrEqual(CHAPTERS.reduce((n, c) => n + c.clues.length, 0));
  });
});

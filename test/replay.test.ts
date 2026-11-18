import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRun, serializeRun, simulateRun } from '../src/shared/run';

const text = readFileSync('replays/sample-run.jsonl', 'utf8');

describe('replay', () => {
  it('produces the same outcome every time', () => {
    const a = simulateRun(parseRun(text));
    const b = simulateRun(parseRun(text));
    expect(a.phase).toBe(b.phase);
    expect(a.t).toBe(b.t);
    expect(a.distance).toBe(b.distance);
    expect(a.events.map((e) => e.kind)).toEqual(b.events.map((e) => e.kind));
  });

  it('round-trips through serialize and parse', () => {
    const run = parseRun(text);
    const again = parseRun(serializeRun(run.header, run.events));
    expect(again.events.length).toBe(run.events.length);
    expect(simulateRun(again).phase).toBe(simulateRun(run).phase);
  });

  it('the sample run finds all clues and finishes', () => {
    const g = simulateRun(parseRun(text));
    expect(g.cluesFound).toBe(3);
    expect(['won', 'lost']).toContain(g.phase);
  });
});

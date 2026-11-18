import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/renderer/game/model';
import { TUNING } from '../src/renderer/game/tuning';
import type { SignalFrame } from '../src/shared/types';

const frame = (o: Partial<SignalFrame> = {}): SignalFrame => ({
  t: 0, lidDeg: 110, lidZone: 'open', squint: 0, pulseBpm: 70, pulseDelta: 0, breathRate: 14,
  breathAmp: 1, breathHolding: false, blinkEvent: false, blinkCount: 0, face: 'ok', faceLostMs: 0, startle: 0, startleEvent: false, ...o,
});

describe('ghost movement', () => {
  it('is frozen while watched', () => {
    const s = newGame();
    for (let i = 0; i < 100; i++) step(s, frame(), 0.1);
    expect(s.distance).toBe(TUNING.startDistance);
  });

  it('lurches on a blink', () => {
    const s = newGame();
    step(s, frame({ blinkEvent: true }), 0.033);
    expect(s.distance).toBeLessThan(TUNING.startDistance - TUNING.blinkLurch + 0.01);
  });

  it('rushes when eyes are shut, faster with a higher pulse', () => {
    const calm = newGame(); const scared = newGame();
    step(calm, frame({ lidZone: 'shut', pulseDelta: 0 }), 1);
    step(scared, frame({ lidZone: 'shut', pulseDelta: 20 }), 1);
    expect(TUNING.startDistance - calm.distance).toBeCloseTo(0.4, 5);
    expect(TUNING.startDistance - scared.distance).toBeCloseTo(0.8, 5);
  });

  it('drifts away when you hold your breath up close, and the hold is capped at 8 s', () => {
    const s = newGame(); s.distance = 2;
    step(s, frame({ lidZone: 'squint', squint: 0.5, breathHolding: true }), 1);
    expect(s.distance).toBeCloseTo(2.3, 5);
    for (let i = 0; i < 8; i++) step(s, frame({ lidZone: 'squint', squint: 0.5, breathHolding: true }), 1);
    expect(s.holdCapped).toBe(true);
    expect(s.breathPrompt).toBe(true);
    expect(s.distance).toBeGreaterThanOrEqual(TUNING.breathCapPushTo - 0.5);
  });

  it('never rewards a higher pulse', () => {
    for (const zone of ['open', 'squint', 'shut'] as const) {
      const lo = newGame(); const hi = newGame();
      step(lo, frame({ lidZone: zone, squint: 0.5, pulseDelta: 0 }), 1);
      step(hi, frame({ lidZone: zone, squint: 0.5, pulseDelta: 25 }), 1);
      expect(hi.distance).toBeLessThanOrEqual(lo.distance);
    }
  });
});

describe('win and lose', () => {
  it('loses when the ghost reaches you', () => {
    const s = newGame();
    for (let i = 0; i < 60 && s.phase !== 'lost'; i++) step(s, frame({ lidZone: 'shut', pulseDelta: 20 }), 1);
    expect(s.phase).toBe('lost');
  });

  it('wins after 3 clues and 8 calm seconds', () => {
    const s = newGame();
    for (let i = 0; i < 100 && s.phase === 'clues'; i++) step(s, frame({ lidZone: 'squint', squint: 0.6 }), 0.1);
    expect(s.cluesFound).toBe(3);
    expect(s.phase).toBe('steady');
    for (let i = 0; i < 100 && s.phase === 'steady'; i++) step(s, frame({ pulseDelta: 2 }), 0.1);
    expect(s.phase).toBe('won');
  });

  it('does not win while the pulse is high', () => {
    const s = newGame(); s.phase = 'steady';
    for (let i = 0; i < 200; i++) step(s, frame({ pulseDelta: 10 }), 0.1);
    expect(s.phase).toBe('steady');
  });
});

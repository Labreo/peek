import { describe, expect, it } from 'vitest';
import { BaselineRecorder, SignalBus, median, nextZone } from '../src/shared/signalBus';
import type { Calibration } from '../src/shared/types';

const cal: Calibration = { openDeg: 110, squintFloorDeg: 60, baselineBpm: 70, breathAmp: 1.0 };
// open >= 100, squint 60..100, shut < 60

describe('lid zones', () => {
  it('maps angles to zones', () => {
    expect(nextZone('open', 105, cal)).toBe('open');
    expect(nextZone('open', 80, cal)).toBe('squint');
    expect(nextZone('open', 30, cal)).toBe('shut');
  });

  it('applies 3 degree hysteresis on boundaries', () => {
    expect(nextZone('open', 98, cal)).toBe('open');     // within 3 of 100
    expect(nextZone('open', 96, cal)).toBe('squint');
    expect(nextZone('squint', 101, cal)).toBe('squint'); // needs 103 to reopen
    expect(nextZone('squint', 103, cal)).toBe('open');
    expect(nextZone('shut', 61, cal)).toBe('shut');      // needs 63 to leave shut
    expect(nextZone('shut', 64, cal)).toBe('squint');
    expect(nextZone('squint', 58, cal)).toBe('squint');
    expect(nextZone('squint', 56, cal)).toBe('shut');
  });

  it('median-filters lid samples', () => {
    const bus = new SignalBus(cal);
    for (const deg of [110, 110, 20, 110, 110]) bus.push({ kind: 'lid', t: 0, deg }); // one glitch sample
    expect(bus.tick(0).lidZone).toBe('open');
  });
});

describe('blink', () => {
  it('edge-triggers once per blink with a 250 ms refractory period', () => {
    const bus = new SignalBus(cal);
    bus.push({ kind: 'blink', t: 0, detected: true });
    bus.push({ kind: 'blink', t: 30, detected: true }); // same blink, still closed
    expect(bus.tick(40).blinkEvent).toBe(true);
    expect(bus.tick(70).blinkEvent).toBe(false);        // one frame only
    bus.push({ kind: 'blink', t: 100, detected: false });
    bus.push({ kind: 'blink', t: 150, detected: true }); // too soon after 0
    expect(bus.tick(160).blinkEvent).toBe(false);
    bus.push({ kind: 'blink', t: 300, detected: false });
    bus.push({ kind: 'blink', t: 400, detected: true });
    const f = bus.tick(410);
    expect(f.blinkEvent).toBe(true);
    expect(f.blinkCount).toBe(2);
  });
});

describe('pulse', () => {
  it('ignores unstable values and smooths with EMA', () => {
    const bus = new SignalBus(cal);
    bus.push({ kind: 'pulse', t: 0, bpm: 200, stable: false });
    expect(bus.tick(0).pulseBpm).toBeNull();
    bus.push({ kind: 'pulse', t: 1, bpm: 80, stable: true });
    bus.push({ kind: 'pulse', t: 2, bpm: 90, stable: true });
    const f = bus.tick(3);
    expect(f.pulseBpm).toBeCloseTo(83, 5);
    expect(f.pulseDelta).toBeCloseTo(13, 5);
    expect(f.face).toBe('ok');
  });
});

describe('breath hold', () => {
  const feed = (bus: SignalBus, from: number, to: number, amp: number) => {
    for (let t = from; t < to; t += 33) bus.push({ kind: 'breath', t, value: amp * Math.sin((t / 4000) * 2 * Math.PI) });
  };

  it('detects a hold after amplitude drops for 2.5 s', () => {
    const bus = new SignalBus(cal);
    feed(bus, 0, 8000, 0.5); // normal breathing, peak to peak 1.0
    expect(bus.tick(8000).breathHolding).toBe(false);
    feed(bus, 8000, 12000, 0.05); // flat
    expect(bus.tick(12000).breathHolding).toBe(false); // window just became flat
    feed(bus, 12000, 15000, 0.05);
    expect(bus.tick(15000).breathHolding).toBe(true);
  });

  it('reports unknown (not holding) when the trace goes stale', () => {
    const bus = new SignalBus(cal);
    feed(bus, 0, 4000, 0.01);
    bus.tick(4000);
    expect(bus.tick(9000).breathHolding).toBe(false);
  });
});

describe('baseline', () => {
  it('takes the median', () => {
    expect(median([3, 1, 2])).toBe(2);
    const b = new BaselineRecorder();
    for (const p of [70, 72, 200, 71]) b.push({ pulseBpm: p, breathAmp: 1 } as never);
    expect(b.result().baselineBpm).toBe(71.5);
  });
});

describe('startle (expressions)', () => {
  it('fires once when fear or surprise crosses the threshold, then decays', () => {
    const bus = new SignalBus(cal);
    bus.push({ kind: 'expression', t: 0, fear: 0.1, surprise: 0.2 });
    expect(bus.tick(0).startleEvent).toBe(false);
    bus.push({ kind: 'expression', t: 100, fear: 0.7, surprise: 0.1 });
    bus.push({ kind: 'expression', t: 200, fear: 0.8, surprise: 0.1 });
    expect(bus.tick(200).startleEvent).toBe(true);
    expect(bus.tick(230).startleEvent).toBe(false);
    expect(bus.tick(2000).startle).toBeLessThan(0.1);
  });
});

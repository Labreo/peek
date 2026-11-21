// Debug HUD (toggle with D). Shows the raw Presage values next to what the game does
// with them, so the integration is visible in the demo video.

import type { SignalFrame } from '../../shared/types';
import type { PresageStatus } from '../presage';

const fmt = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? '--' : x.toFixed(d));

export class DebugHud {
  private el: HTMLElement;
  private body: HTMLElement;
  private spark: HTMLCanvasElement;
  private fpsT = performance.now();
  private frames = 0;
  private fps = 0;
  visible = false;

  constructor(el: HTMLElement) {
    this.el = el;
    el.innerHTML = '<div class="title">PEEK DEBUG</div><div class="b"></div><canvas width="600" height="80"></canvas>';
    this.body = el.querySelector('.b')!;
    this.spark = el.querySelector('canvas')!;
  }

  toggle(on = !this.visible) {
    this.visible = on;
    this.el.hidden = !on;
  }

  update(f: SignalFrame | null, o: {
    presage: PresageStatus | null; lidSource: string; distance: number | null; velocity: number | null;
    state: string; trace: number[]; baselineBpm: number | null; holdS?: number;
  }) {
    this.frames++;
    const now = performance.now();
    if (now - this.fpsT >= 1000) { this.fps = (this.frames * 1000) / (now - this.fpsT); this.frames = 0; this.fpsT = now; }
    if (!this.visible) return;
    const p = o.presage;
    (this.el.querySelector('.title') as HTMLElement).innerHTML = o.lidSource === 'replay' ? 'PEEK DEBUG &middot; RECORDED RUN' : 'PEEK DEBUG &middot; PRESAGE LIVE';
    const rows: [string, string, string?][] = [
      ['state', o.state],
      ['lid angle', f ? `${fmt(f.lidDeg, 0)}&deg; ${f.lidZone.toUpperCase()}` : '--', o.lidSource],
      ['squint', fmt(f?.squint, 2)],
      ['pulse', f?.pulseBpm != null ? `${fmt(f.pulseBpm)} bpm` : '--', 'presage'],
      ['pulse delta', f?.pulseDelta != null ? `${f.pulseDelta >= 0 ? '+' : ''}${fmt(f.pulseDelta)} (base ${fmt(o.baselineBpm)})` : '--'],
      ['breathing', f?.breathRate != null ? `${fmt(f.breathRate)} /min` : '--', 'presage'],
      ['breath amp', fmt(f?.breathAmp, 3)],
      ['breath hold', f ? (f.breathHolding ? `HOLDING ${fmt(o.holdS ?? 0)}s` : 'no') : '--'],
      ['blinks', f ? `${f.blinkCount}${f.blinkEvent ? ' &#9679;' : ''}` : '--', 'presage'],
      ['face', f ? f.face : '--', 'presage'],
      ['startle', f ? `${fmt(f.startle, 2)}${f.startleEvent ? ' &#9679;' : ''}` : '--', 'presage expr'],
      ['sdk', p ? `${p.processingName} &middot; ${p.packets} pkts` : o.lidSource === 'replay' ? 'replay' : 'not started'],
      ['ghost', o.distance != null ? `${fmt(o.distance, 2)} m &middot; v ${fmt(o.velocity, 2)}` : '--'],
      ['fps', fmt(this.fps, 0)],
    ];
    if (p?.error) rows.push(['error', `<span class="err">${p.error}</span>`]);
    this.body.innerHTML = rows.map(([k, v, s]) => `<div><span class="k">${k}</span>${v}${s ? ` <span class="src">${s}</span>` : ''}</div>`).join('');

    const g = this.spark.getContext('2d')!;
    const { width: w, height: h } = this.spark;
    g.clearRect(0, 0, w, h);
    const tr = o.trace.slice(-240);
    if (tr.length > 2) {
      let lo = Infinity, hi = -Infinity;
      for (const v of tr) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const span = Math.max(1e-6, hi - lo);
      g.strokeStyle = f?.breathHolding ? '#6fae8f' : '#d9a24a';
      g.lineWidth = 2;
      g.beginPath();
      tr.forEach((v, i) => {
        const x = (i / (tr.length - 1)) * w;
        const y = h - 4 - ((v - lo) / span) * (h - 8);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.stroke();
    }
  }
}

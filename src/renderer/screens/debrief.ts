// Debrief: a game recap, not health information. Only describes what happened in the run.

import type { GameEvent } from '../../shared/types';
import { mount, q } from './mount';

export interface Sample { t: number; pulse: number | null; distance: number; zone: string; chapter?: number; }

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Plain-language lines about the run. */
export function recapLines(samples: Sample[], events: GameEvent[], outcome: string, t0: number, progress?: { cleared: number; chapters: number; reached: number }): string[] {
  const lines: string[] = [];
  const pulseAt = (t: number) => {
    let best: Sample | null = null;
    for (const s of samples) if (s.pulse != null && s.t <= t) best = s;
    return best?.pulse ?? null;
  };
  // Biggest pulse rise in the 20 s after any eyes-shut moment.
  let bestRise: { rise: number; t: number } | null = null;
  for (const e of events.filter((x) => x.kind === 'shut')) {
    const p0 = pulseAt(e.t);
    if (p0 == null) continue;
    for (const s of samples) {
      if (s.t > e.t && s.t <= e.t + 20000 && s.pulse != null) {
        const rise = s.pulse - p0;
        if (!bestRise || rise > bestRise.rise) bestRise = { rise, t: e.t };
      }
    }
  }
  if (bestRise && bestRise.rise >= 2) lines.push(`Your pulse rose ${Math.round(bestRise.rise)} bpm after you shut your eyes at ${mmss(bestRise.t - t0)}.`);
  const blinks = events.filter((e) => e.kind === 'blinkStep').length;
  if (blinks) lines.push(`You blinked ${blinks} time${blinks === 1 ? '' : 's'} while watching. Each one let it take a step.`);
  const shuts = events.filter((e) => e.kind === 'shut').length;
  if (shuts) lines.push(`You shut your eyes ${shuts} time${shuts === 1 ? '' : 's'}.`);
  const dark = events.filter((e) => e.kind === 'blackout').length;
  if (dark) lines.push(`The lamp died ${dark} time${dark === 1 ? '' : 's'}.`);
  const losses = events.filter((e) => e.kind === 'lose').length;
  if (losses && outcome === 'won') lines.push(`It caught you ${losses} time${losses === 1 ? '' : 's'} along the way.`);
  const hides = events.filter((e) => e.kind === 'breathHide').length;
  if (hides) lines.push(`Holding your breath made it lose you ${hides} time${hides === 1 ? '' : 's'}.`);
  const pulses = samples.map((s) => s.pulse).filter((p): p is number => p != null);
  if (pulses.length) lines.push(`Your pulse ranged from ${Math.round(Math.min(...pulses))} to ${Math.round(Math.max(...pulses))} bpm during the run.`);
  const end = samples.length ? samples[samples.length - 1].t - t0 : 0;
  lines.unshift(
    outcome === 'won' ? `You made it through all ${progress?.chapters ?? 1} chapters in ${mmss(end)} of play.`
      : outcome === 'lost' ? `The Archivist reached you in chapter ${progress?.reached ?? 1} after ${mmss(end)} of play. Chapters cleared: ${progress?.cleared ?? 0} of ${progress?.chapters ?? 1}.`
        : outcome === 'panic' ? `You stopped the run at ${mmss(end)}. Good call if it got too much.`
          : 'The run did not start.',
  );
  return lines;
}

function drawChart(c: HTMLCanvasElement, samples: Sample[], events: GameEvent[], baseline: number | null) {
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth * dpr, H = c.clientHeight * dpr;
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const w = c.clientWidth, h = c.clientHeight, pad = { l: 40, r: 40, t: 14, b: 22 };
  if (samples.length < 2) {
    g.fillStyle = '#7c766a'; g.font = '13px monospace'; g.fillText('Not enough data for a chart.', pad.l, h / 2); return;
  }
  const t0 = samples[0].t, t1 = samples[samples.length - 1].t;
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (w - pad.l - pad.r);
  const pulses = samples.map((s) => s.pulse).filter((p): p is number => p != null);
  const pLo = Math.min(...pulses, baseline ?? Infinity) - 5, pHi = Math.max(...pulses, baseline ?? -Infinity) + 5;
  const yp = (p: number) => pad.t + (1 - (p - pLo) / Math.max(1, pHi - pLo)) * (h - pad.t - pad.b);
  const yd = (d: number) => pad.t + (d / 10) * (h - pad.t - pad.b);

  // Shut-eye spans.
  g.fillStyle = 'rgba(255,255,255,0.05)';
  let shutStart: number | null = null;
  for (const s of samples) {
    if (s.zone === 'shut' && shutStart == null) shutStart = s.t;
    if (s.zone !== 'shut' && shutStart != null) { g.fillRect(x(shutStart), pad.t, x(s.t) - x(shutStart), h - pad.t - pad.b); shutStart = null; }
  }
  if (shutStart != null) g.fillRect(x(shutStart), pad.t, x(t1) - x(shutStart), h - pad.t - pad.b);

  if (baseline != null && Number.isFinite(pLo)) {
    g.strokeStyle = '#3a342c'; g.setLineDash([4, 4]); g.beginPath();
    g.moveTo(pad.l, yp(baseline)); g.lineTo(w - pad.r, yp(baseline)); g.stroke(); g.setLineDash([]);
  }
  // Ghost distance (right axis, 0 m at top: the ghost reaching you).
  g.strokeStyle = '#5a5248'; g.lineWidth = 1.5; g.beginPath();
  samples.forEach((s, i) => (i ? g.lineTo(x(s.t), yd(s.distance)) : g.moveTo(x(s.t), yd(s.distance))));
  g.stroke();
  // Pulse.
  g.strokeStyle = '#c0392b'; g.lineWidth = 2; g.beginPath();
  let started = false;
  for (const s of samples) {
    if (s.pulse == null) continue;
    if (started) g.lineTo(x(s.t), yp(s.pulse)); else { g.moveTo(x(s.t), yp(s.pulse)); started = true; }
  }
  g.stroke();
  // Event markers.
  // Chapter boundaries.
  g.strokeStyle = '#3a342c';
  for (const e of events) if (e.kind === 'chapter' && e.t > t0) { g.beginPath(); g.moveTo(x(e.t), pad.t); g.lineTo(x(e.t), h - pad.b); g.stroke(); }
  const color: Record<string, string> = { blinkStep: '#d9a24a', breathHide: '#6fae8f', clue: '#e8e2d4', blackout: '#6a7a9a' };
  for (const e of events) {
    const col = color[e.kind];
    if (!col) continue;
    g.fillStyle = col;
    g.fillRect(x(e.t) - 1, h - pad.b - (e.kind === 'clue' ? 14 : 8), 2, e.kind === 'clue' ? 14 : 8);
  }
  g.fillStyle = '#7c766a'; g.font = '11px monospace';
  if (Number.isFinite(pLo)) { g.fillText(`${Math.round(pHi)}`, 6, pad.t + 8); g.fillText(`${Math.round(pLo)}`, 6, h - pad.b); }
  g.fillText('bpm', 6, h / 2);
  g.fillText('ghost m', w - pad.r + 2, pad.t + 8);
  g.fillText('0:00', pad.l, h - 6);
  g.fillText(mmss(t1 - t0), w - pad.r - 24, h - 6);
}

export function showDebrief(o: {
  samples: Sample[]; events: GameEvent[]; outcome: string; baseline: number | null; canSave: boolean;
  chapterReached: number; chapters: number; cleared: number; onRetry: (() => void) | null;
  onReplay: () => void; onSave: () => Promise<string>; onDelete: () => Promise<number>; onQuit: () => void;
}) {
  const t0 = o.samples[0]?.t ?? 0;
  const lines = recapLines(o.samples, o.events, o.outcome, t0, { cleared: o.cleared, chapters: o.chapters, reached: o.chapterReached });
  const el = mount(`
    <h2>${o.outcome === 'won' ? 'You made it out' : o.outcome === 'lost' ? 'It found you' : 'Run stopped'}</h2>
    <canvas class="chart" id="chart"></canvas>
    <p class="small"><span style="color:#c0392b">&#9644;</span> your pulse &nbsp; <span style="color:#5a5248">&#9644;</span> ghost distance &nbsp;
      <span style="color:#d9a24a">|</span> blink step &nbsp; <span style="color:#6fae8f">|</span> breath hide &nbsp; <span style="color:#e8e2d4">|</span> clue &nbsp; <span style="color:#6a7a9a">|</span> lamp died &nbsp; shaded: eyes shut &nbsp; lines: chapters</p>
    <ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>
    <p class="small">This is a recap of your game, not health information.</p>
    <div class="row">
      ${o.onRetry ? `<button class="primary" id="retry">Retry chapter ${o.chapterReached}</button>` : ''}
      <button ${o.onRetry ? '' : 'class="primary"'} id="again">Play from chapter 1</button>
      <button id="save" ${o.canSave ? '' : 'disabled'}>Save run file</button>
      <button id="del">Delete my data</button>
      <button id="quit">Quit</button>
    </div>
    <p class="small" id="msg"></p>
  `);
  requestAnimationFrame(() => drawChart(q<HTMLCanvasElement>(el, '#chart'), o.samples, o.events, o.baseline));
  q(el, '#again').onclick = o.onReplay;
  if (o.onRetry) q(el, '#retry').onclick = o.onRetry;
  q(el, '#quit').onclick = o.onQuit;
  q(el, '#save').onclick = async () => {
    const path = await o.onSave();
    q(el, '#msg').textContent = `Saved to ${path}`;
  };
  q(el, '#del').onclick = async () => {
    const n = await o.onDelete();
    q(el, '#msg').textContent = `Cleared this session's readings from memory and deleted ${n} saved run file${n === 1 ? '' : 's'}.`;
    (q(el, '#save') as HTMLButtonElement).disabled = true;
  };
}

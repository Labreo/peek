// 60 s calm baseline: median pulse and normal breathing amplitude.

import type { SignalFrame } from '../../shared/types';
import { mount, q } from './mount';

export const BASELINE_MS = 60000;
export const BASELINE_MAX_MS = 100000;

export function showBaseline() {
  const el = mount(`
    <h2>Settle in</h2>
    <p>Keep the lid open, sit back and breathe normally. This sets your calm pulse for the game.</p>
    <svg class="ring" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="44" fill="none" stroke="#1c1915" stroke-width="6"/>
      <circle id="arc" cx="50" cy="50" r="44" fill="none" stroke="#e8e2d4" stroke-width="6" stroke-linecap="round"
        stroke-dasharray="276.5" stroke-dashoffset="276.5" transform="rotate(-90 50 50)"/>
      <text id="pct" x="50" y="56" text-anchor="middle" fill="#e8e2d4" font-size="18" font-family="monospace">0%</text>
    </svg>
    <p class="big" id="pulse" style="text-align:center">-- <span class="small">bpm</span></p>
    <p class="small" id="note" style="text-align:center">The timer only runs while your face is found.</p>
  `);
  return {
    update(progress: number, f: SignalFrame, hint: string) {
      const p = Math.max(0, Math.min(1, progress));
      q(el, '#arc').setAttribute('stroke-dashoffset', String(276.5 * (1 - p)));
      q(el, '#pct').textContent = `${Math.round(p * 100)}%`;
      q(el, '#pulse').innerHTML = `${f.pulseBpm != null ? Math.round(f.pulseBpm) : '--'} <span class="small">bpm</span>`;
      q(el, '#note').textContent = f.face === 'ok' ? 'The timer only runs while your face is found.' : hint;
    },
  };
}

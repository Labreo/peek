// Camera check: pick the camera (the Pixel), wait for Presage to find the face and a stable pulse.

import type { SignalFrame } from '../../shared/types';
import type { CameraChoice, PresageStatus } from '../presage';
import { esc, mount, q } from './mount';

const FORCE_CONTINUE_MS = 30000;

export function showCameraCheck(o: {
  cameras: CameraChoice[];
  selected: string | null;
  lidNote: string | null;
  onCamera: (deviceId: string) => void;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const opts = o.cameras
    .map((c) => `<option value="${esc(c.deviceId)}" ${c.deviceId === o.selected ? 'selected' : ''}>${esc(c.label)}</option>`)
    .join('');
  const el = mount(`
    <h2>Camera check</h2>
    <p>Prop your phone at face height, about an arm's length away, with a soft lamp on your face.</p>
    <div class="row"><label for="cam">Camera</label> <select id="cam">${opts}</select></div>
    <p class="big" id="pulse">-- <span class="small">bpm</span></p>
    <p id="hint" class="status-bad">Starting the Presage SDK...</p>
    <p class="small" id="detail"></p>
    ${o.lidNote ? `<p class="small status-bad">${esc(o.lidNote)} Use the <span class="kbd">&uarr;</span> <span class="kbd">&darr;</span> arrow keys as the lid.</p>` : ''}
    <div class="row">
      <button class="primary" id="go" disabled>Waiting for a stable pulse</button>
      <button id="retry" hidden>Try again</button>
    </div>
  `);
  const sel = q<HTMLSelectElement>(el, '#cam');
  sel.onchange = () => o.onCamera(sel.value);
  const go = q<HTMLButtonElement>(el, '#go');
  go.onclick = o.onContinue;
  const retry = q<HTMLButtonElement>(el, '#retry');
  retry.onclick = () => { retry.hidden = true; o.onRetry(); };
  const started = performance.now();

  return {
    update(p: PresageStatus | null, f: SignalFrame) {
      q(el, '#pulse').innerHTML = `${f.pulseBpm != null ? Math.round(f.pulseBpm) : '--'} <span class="small">bpm</span>`;
      const hint = q(el, '#hint');
      const ready = f.face === 'ok' && f.pulseBpm != null;
      hint.textContent = p?.error ? p.error : ready ? 'Face found and pulse is stable. Ready.' : f.face === 'warming_up' && p?.validation === 0 ? 'Face found. Warming up the pulse reading (can take up to a minute; sit still)...' : p?.hint ?? '';
      hint.className = p?.error ? 'err' : ready ? 'status-ok' : 'status-bad';
      // Presage asks hosts to offer a user-initiated fresh start after an error, never an automatic one.
      retry.hidden = !(p?.error && p.retryable);
      q(el, '#detail').textContent = p ? `SDK ${p.processingName} | ${p.packets} metric packets` : '';
      const late = performance.now() - started > FORCE_CONTINUE_MS;
      go.disabled = !ready && !late;
      go.textContent = ready ? 'Continue' : late ? 'Continue without a stable pulse' : 'Waiting for a stable pulse';
    },
  };
}

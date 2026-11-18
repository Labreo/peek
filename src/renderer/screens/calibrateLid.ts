// Lid calibration (Section 7.4): record the usual open angle, then the squint floor.

import { mount, q } from './mount';

export function showCalibrateLid(onDone: (openDeg: number, squintFloorDeg: number) => void) {
  const el = mount(`
    <h2>Your lid is your eyelids</h2>
    <p id="step">1 of 2. Open the lid to where you usually use it, then press <span class="kbd">Enter</span>.</p>
    <div class="lidbar"><div class="fill" id="fill"></div><div class="mark" id="mark" hidden></div></div>
    <p class="big" id="deg">--&deg;</p>
    <p class="small" id="note"></p>
  `);
  let open: number | null = null;
  let still: { since: number; deg: number } | null = null;
  let cur = 0;

  const finishSquint = () => {
    if (open == null) return;
    if (cur > open - 20) {
      q(el, '#note').textContent = 'Tilt it further down, at least 20 degrees below your open angle.';
      return;
    }
    onDone(open, cur);
  };

  return {
    enter() {
      if (open == null) {
        open = cur;
        const mark = q(el, '#mark');
        mark.hidden = false;
        mark.style.left = `${Math.min(100, (open / 140) * 100)}%`;
        q(el, '#step').innerHTML = '2 of 2. Tilt it down until you can barely see the screen. Hold it still, or press <span class="kbd">Enter</span>.';
      } else {
        finishSquint();
      }
    },
    update(deg: number) {
      cur = deg;
      q(el, '#deg').innerHTML = `${Math.round(deg)}&deg;`;
      q(el, '#fill').style.width = `${Math.min(100, (deg / 140) * 100)}%`;
      if (open == null) return;
      // Auto-capture the squint floor when held still for 2 s.
      const now = performance.now();
      if (!still || Math.abs(deg - still.deg) > 2) still = { since: now, deg };
      else if (now - still.since > 2000 && deg <= open - 20) finishSquint();
    },
  };
}

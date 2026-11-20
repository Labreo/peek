// Rules, content note and options, then Enter to begin.

import { mount, q } from './mount';

export function showIntro(o: {
  flashing: boolean; heart: boolean; replay: boolean; baselineBpm: number | null;
  chapters: number; startChapter: number; debug: boolean;
  onToggle: (k: 'flashing' | 'heart') => void; onStart: () => void;
}) {
  const el = mount(`
    <p class="title">PEEK</p>
    <p><b>The Archivist only moves when you are not truly watching.</b> ${o.chapters} chapters, each deeper into the archive.</p>
    <ul>
      <li><b>Lid open:</b> you are watching. It cannot move. Every <b>blink</b> lets it take a step. Hold a calm, steady gaze and it slowly backs away.</li>
      <li><b>Tilt the lid down to squint.</b> Writing on the walls only shows when you squint. Find all 3 messages. While you squint, it creeps closer.</li>
      <li><b>Lower the lid most of the way</b> to close your eyes (never fully shut, or the Mac sleeps). You will not see it. It rushes in. Listen.</li>
      <li>When it is close, <b>hold your breath</b> and it loses you for a moment. Never more than 8 seconds, then breathe normally.</li>
      <li>The faster your pulse, the faster it moves. To escape, look at it and steady yourself.</li>
    </ul>
    <p class="small">Your calm pulse: ${o.baselineBpm != null ? `${Math.round(o.baselineBpm)} bpm` : 'not measured'}. Headphones strongly recommended.</p>
    <p class="small status-bad">Content note: contains a jump scare and flickering light. Stop any time with <span class="kbd">Space</span> or <span class="kbd">Esc</span>.</p>
    <div class="row">
      <button id="opt-flash">Flashing light: <b id="fv"></b> <span class="kbd">F</span></button>
      <button id="opt-heart">Heartbeat sound: <b id="hv"></b> <span class="kbd">M</span></button>
    </div>
    ${o.debug ? `<p class="small">Debug: start at chapter <b>${o.startChapter}</b> (press 1 to ${o.chapters})</p>` : ''}
    <div class="row"><button class="primary" id="go">${o.replay ? 'Watch the recorded run' : 'Begin'} <span class="kbd">Enter</span></button></div>
  `);
  const sync = (s: { flashing: boolean; heart: boolean }) => {
    q(el, '#fv').textContent = s.flashing ? 'on' : 'off';
    q(el, '#hv').textContent = s.heart ? 'on' : 'off';
  };
  sync(o);
  q(el, '#opt-flash').onclick = () => o.onToggle('flashing');
  q(el, '#opt-heart').onclick = () => o.onToggle('heart');
  q(el, '#go').onclick = o.onStart;
  return { sync };
}

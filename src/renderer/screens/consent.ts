// Consent card, shown before any camera access (PEEK_PLAN.md Section 12).

import { mount, q } from './mount';

export function showConsent(onAgree: () => void, onQuit: () => void) {
  const el = mount(`
    <p class="title">PEEK</p>
    <h2>Before we start</h2>
    <p>Peek uses your camera to read your pulse, breathing and blinks while you play. This drives the game.</p>
    <ul>
      <li>Everything is processed on this computer by the Presage SmartSpectra SDK. No video is recorded or saved.</li>
      <li>Your readings are kept in memory during the session and cleared when you quit, unless you choose to save a run file to your own computer.</li>
      <li>Nothing is uploaded by Peek. Presage's optional diagnostic telemetry is turned off. The SDK still contacts Presage to check the API key and count usage.</li>
      <li>Only the person at the computer is measured. Peek is not designed to measure anyone else.</li>
      <li>This is a game, not a health tool. If you feel unwell or too scared, press <span class="kbd">Space</span> or <span class="kbd">Esc</span> to stop at any time.</li>
    </ul>
    <div class="row">
      <button class="primary" id="agree">I agree, start camera</button>
      <button id="quit">No thanks, quit</button>
    </div>
  `);
  q(el, '#agree').onclick = onAgree;
  q(el, '#quit').onclick = onQuit;
}

export function showMissingKey(onQuit: () => void) {
  const el = mount(`
    <h2>Presage API key missing</h2>
    <p>Peek needs a free SmartSpectra API key to read your pulse and breathing.</p>
    <ol>
      <li>Register at <b>physiology.presagetech.com</b> and copy your key.</li>
      <li>Create a file named <span class="kbd">.env</span> in the Peek folder with one line:<br/><span class="kbd">PRESAGE_API_KEY=your_key_here</span></li>
      <li>Run <span class="kbd">npm start</span> again.</li>
    </ol>
    <p class="small">No key? You can still watch a recorded run: <span class="kbd">npm run replay</span></p>
    <div class="row"><button class="primary" id="quit">Quit</button></div>
  `);
  q(el, '#quit').onclick = onQuit;
}

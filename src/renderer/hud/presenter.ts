// Presenter view (toggle with V, or start with `npm run demo`).
// Shows the player's live face from the sensing camera in a corner, with the signals the game
// is reading drawn on top. Made for screen-recording demos: viewers see the person, the lid
// and the ghost react together, even while the game screen is black with the eyes shut.
// The video is only displayed on this screen. Peek still records and saves no video.

import type { SignalFrame } from '../../shared/types';

export class PresenterView {
  private el: HTMLElement;
  private video: HTMLVideoElement;
  private pulse: HTMLElement;
  private lid: HTMLElement;
  private zone: HTMLElement;
  private blink: HTMLElement;
  private hinge: SVGLineElement;
  private blinkUntil = 0;
  visible = false;

  constructor(el: HTMLElement) {
    this.el = el;
    el.innerHTML = `
      <video muted playsinline></video>
      <div class="pv-zone"></div>
      <div class="pv-blink">BLINK</div>
      <div class="pv-bar">
        <span class="pv-pulse">--</span><span class="pv-unit">bpm</span>
        <svg class="pv-hinge" viewBox="0 0 40 30" aria-hidden="true">
          <line x1="4" y1="26" x2="36" y2="26" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
          <line class="pv-lid" x1="4" y1="26" x2="4" y2="2" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
        </svg>
        <span class="pv-deg">--&deg;</span>
        <span class="pv-src">Presage + hinge, live</span>
      </div>`;
    this.video = el.querySelector('video')!;
    this.pulse = el.querySelector('.pv-pulse')!;
    this.lid = el.querySelector('.pv-deg')!;
    this.zone = el.querySelector('.pv-zone')!;
    this.blink = el.querySelector('.pv-blink')!;
    this.hinge = el.querySelector('.pv-lid')!;
  }

  setStream(stream: MediaStream | null) {
    if (this.video.srcObject !== stream) {
      this.video.srcObject = stream;
      if (stream) void this.video.play().catch(() => { /* autoplay refused: shows on next toggle */ });
    }
  }

  toggle(on = !this.visible) {
    this.visible = on;
    this.el.hidden = !on;
  }

  update(f: SignalFrame, o: { hasCamera: boolean; label: string | null }) {
    if (!this.visible) return;
    this.el.classList.toggle('no-cam', !o.hasCamera);
    (this.el.querySelector('.pv-src') as HTMLElement).textContent = o.hasCamera ? 'Presage + hinge, live' : 'recorded run';
    this.pulse.textContent = f.pulseBpm != null ? String(Math.round(f.pulseBpm)) : '--';
    this.lid.innerHTML = `${Math.round(f.lidDeg)}&deg;`;
    // Hinge icon: the lid line rotates with the real angle (0 = shut flat, 90 = upright).
    const a = (Math.min(135, Math.max(0, f.lidDeg)) * Math.PI) / 180;
    this.hinge.setAttribute('x2', String(4 + Math.cos(a) * 24));
    this.hinge.setAttribute('y2', String(26 - Math.sin(a) * 24));
    const zoneText = o.label ?? (f.lidZone === 'open' ? 'WATCHING' : f.lidZone === 'squint' ? 'SQUINTING' : 'EYES SHUT');
    this.zone.textContent = zoneText;
    this.zone.className = `pv-zone z-${f.lidZone}`;
    const now = performance.now();
    if (f.blinkEvent) this.blinkUntil = now + 400;
    this.blink.style.opacity = now < this.blinkUntil ? '1' : '0';
  }
}

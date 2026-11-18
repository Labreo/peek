// All sound is synthesized with Web Audio, so there are no audio assets to license.
// Heartbeat follows the live Presage pulse. Footsteps are positioned with a PannerNode
// so they come closer in stereo while your eyes are shut.

import { TUNING } from './tuning';

export class GameAudio {
  ctx: AudioContext;
  private master: GainNode;
  private heartGain: GainNode;
  private ambGain: GainNode;
  private rainGain: GainNode;
  private panner: PannerNode;
  private stepBus: GainNode;
  private noise: AudioBuffer;
  private nextBeat = 0;
  private nextStep = 0;
  private stepSide = 1;
  heartMuted = false;

  constructor() {
    this.ctx = new AudioContext();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(c.destination);

    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brown noise
      d[i] = last * 3.5;
    }

    // Low room tone.
    this.ambGain = c.createGain();
    this.ambGain.gain.value = 0;
    const amb = this.loopNoise();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    amb.connect(lp).connect(this.ambGain).connect(this.master);

    // Soft rain for the calm baseline scene.
    this.rainGain = c.createGain();
    this.rainGain.gain.value = 0;
    const rainBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const rd = rainBuf.getChannelData(0);
    for (let i = 0; i < rd.length; i++) rd[i] = (Math.random() * 2 - 1) * (Math.random() < 0.002 ? 1 : 0.25);
    const rain = c.createBufferSource();
    rain.buffer = rainBuf;
    rain.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2500;
    bp.Q.value = 0.4;
    rain.connect(bp).connect(this.rainGain).connect(this.master);
    rain.start();

    this.heartGain = c.createGain();
    this.heartGain.gain.value = 0.9;
    this.heartGain.connect(this.master);

    this.panner = new PannerNode(c, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 1.2 });
    this.stepBus = c.createGain();
    this.stepBus.connect(this.panner).connect(this.master);
  }

  private loopNoise(): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start();
    return s;
  }

  resume() { void this.ctx.resume(); }

  setAmbience(level: number) { this.ambGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.5); }
  setRain(level: number) { this.rainGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.8); }

  /** One "lub-dub". */
  private beat(at: number, intensity: number) {
    const c = this.ctx;
    for (const [off, f, g] of [[0, 55, 1], [0.14, 48, 0.7]] as const) {
      const o = c.createOscillator();
      const e = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.6, at + off);
      o.frequency.exponentialRampToValueAtTime(f, at + off + 0.08);
      e.gain.setValueAtTime(0.0001, at + off);
      e.gain.exponentialRampToValueAtTime(g * (0.4 + 0.6 * intensity), at + off + 0.015);
      e.gain.exponentialRampToValueAtTime(0.0001, at + off + 0.22);
      o.connect(e).connect(this.heartGain);
      o.start(at + off);
      o.stop(at + off + 0.25);
    }
  }

  private step(at: number, loud: number) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, at);
    e.gain.exponentialRampToValueAtTime(loud, at + 0.01);
    e.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    s.connect(f).connect(e).connect(this.stepBus);
    s.start(at, Math.random() * 1.5, 0.3);
  }

  /** Called every frame. */
  update(o: { bpm: number | null; heartOn: boolean; distance: number; velocity: number; shut: boolean }) {
    const c = this.ctx;
    const now = c.currentTime;
    // Heartbeat at the live pulse.
    if (o.heartOn && !this.heartMuted && o.bpm && o.bpm > 30 && o.bpm < 200) {
      if (this.nextBeat < now) this.nextBeat = now + 0.05;
      while (this.nextBeat < now + 0.15) {
        this.beat(this.nextBeat, Math.min(1, Math.max(0, (o.bpm - 60) / 50)));
        this.nextBeat += 60 / o.bpm;
      }
    }
    // Footsteps whenever the ghost moves toward you.
    const p = this.panner;
    const side = Math.sin(now * 0.3) * 1.5;
    p.positionX.setTargetAtTime(side, now, 0.3);
    p.positionZ.setTargetAtTime(-Math.max(0.5, o.distance), now, 0.3);
    if (o.velocity > 0.02) {
      const interval = Math.max(0.35, 1.1 - o.velocity);
      if (this.nextStep < now) this.nextStep = now + 0.05;
      while (this.nextStep < now + 0.15) {
        this.stepSide *= -1;
        this.step(this.nextStep, o.shut ? 0.9 : 0.5);
        this.nextStep += interval * (1 + 0.08 * this.stepSide);
      }
    }
  }

  /** Lurch sound on a blink step. */
  lurch() {
    const c = this.ctx;
    const t = c.currentTime;
    this.step(t, 1);
    this.step(t + 0.09, 0.6);
  }

  chime() {
    const c = this.ctx;
    const t = c.currentTime;
    for (const f of [392, 587]) {
      const o = c.createOscillator();
      const e = c.createGain();
      o.frequency.value = f;
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(e).connect(this.master);
      o.start(t);
      o.stop(t + 1.3);
    }
  }

  /** The one jump scare: short and volume-capped (Section 13). */
  scare() {
    const c = this.ctx;
    const t = c.currentTime;
    const dur = TUNING.jumpScareMs / 1000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(TUNING.jumpScareGain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    for (const f of [110, 116, 233]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.5, t + dur);
      o.connect(g);
      o.start(t);
      o.stop(t + dur);
    }
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.connect(g);
    n.start(t, 0, dur);
  }

  silenceAll() {
    this.setAmbience(0);
    this.setRain(0);
    this.stepBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }
  unsilence() { this.stepBus.gain.setTargetAtTime(1, this.ctx.currentTime, 0.2); }
}

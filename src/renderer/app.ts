// Peek renderer: the state machine (PEEK_PLAN.md Section 7.2).
// BOOT -> CONSENT -> CAMERA_CHECK -> CALIBRATE_LID -> CALIBRATE_BASELINE -> INTRO
//      -> PLAY -> (WIN | LOSE) -> DEBRIEF -> (REPLAY | QUIT)
// Any state -> PANIC_EXIT on Space or Esc -> DEBRIEF
// PLAY -> PAUSED_NO_FACE if the face is lost for more than 3 s

import { BaselineRecorder, SignalBus } from '../shared/signalBus';
import { parseRun, ReplayFeeder, serializeRun, STEP_MS, type Run } from '../shared/run';
import type { Calibration, GameEvent, PeekConfig, RawEvent, SignalFrame } from '../shared/types';
import type { PeekApi } from '../preload/preload';
import { GameAudio } from './game/audio';
import { newGame, step, type GameState } from './game/model';
import { CLUES, RoomScene } from './game/scene';
import { TUNING } from './game/tuning';
import { DebugHud } from './hud/debug';
import { listCameras, Presage } from './presage';
import { showBaseline, BASELINE_MAX_MS, BASELINE_MS } from './screens/baseline';
import { showCalibrateLid } from './screens/calibrateLid';
import { showCameraCheck } from './screens/cameraCheck';
import { showConsent, showMissingKey } from './screens/consent';
import { showDebrief, type Sample } from './screens/debrief';
import { showIntro } from './screens/intro';
import { clear, mount } from './screens/mount';

declare global { interface Window { peek: PeekApi } }

type State =
  | 'BOOT' | 'CONSENT' | 'CAMERA_CHECK' | 'CALIBRATE_LID' | 'CALIBRATE_BASELINE' | 'INTRO'
  | 'PLAY' | 'PAUSED_NO_FACE' | 'WIN' | 'LOSE' | 'DEBRIEF' | 'ERROR';

const $ = (id: string) => document.getElementById(id)!;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

let config: PeekConfig;
let state: State = 'BOOT';
let cal: Calibration = { openDeg: 110, squintFloorDeg: 60, baselineBpm: null, breathAmp: null };
const bus = new SignalBus(cal);
let presage: Presage | null = null;
let audio: GameAudio | null = null;
const scene = new RoomScene($('gl') as HTMLCanvasElement);
const hud = new DebugHud($('hud'));
let frame: SignalFrame = bus.tick(performance.now());

// Lid simulator (arrow keys) when there is no sensor.
let simLid = false;
let simDeg = 110;
const keysDown = new Set<string>();

// Options.
let flashing = store.get('peek.flashing') !== 'off';
let heartOn = store.get('peek.heart') !== 'off';

// Run state.
let game: GameState = newGame();
let playStart = 0;       // clock value when PLAY began
let simT = 0;            // ms of simulated play time
let acc = 0;
let runEvents: RawEvent[] = [];
let samples: Sample[] = [];
let lastSampleT = -Infinity;
let replay: Run | null = null;
let feeder: ReplayFeeder | null = null;
let outcome = 'none';
let stateT = 0;
let screenCtl: { update?: (...a: never[]) => void; enter?: () => void; sync?: (s: { flashing: boolean; heart: boolean }) => void } | null = null;
let baselineMs = 0;
let baselineRec = new BaselineRecorder();
let scareDone = false;

function onRaw(e: RawEvent) {
  bus.push(e);
  if (state === 'PLAY' || state === 'PAUSED_NO_FACE') runEvents.push({ ...e, t: e.t - playStart });
}

function go(next: State) {
  state = next;
  stateT = performance.now();
  screenCtl = null;
  $('play-ui').hidden = next !== 'PLAY';
  switch (next) {
    case 'CONSENT':
      showConsent(() => { ensureAudio(); go('CAMERA_CHECK'); }, () => window.peek.quit());
      break;
    case 'CAMERA_CHECK':
      void startCameraCheck();
      break;
    case 'CALIBRATE_LID': {
      const c = showCalibrateLid((openDeg, squintFloorDeg) => {
        cal = { ...cal, openDeg, squintFloorDeg };
        bus.setCalibration(cal);
        store.set('peek.lidcal', JSON.stringify({ openDeg, squintFloorDeg }));
        go('CALIBRATE_BASELINE');
      });
      screenCtl = c;
      break;
    }
    case 'CALIBRATE_BASELINE':
      baselineMs = 0;
      baselineRec = new BaselineRecorder();
      screenCtl = showBaseline();
      audio?.setRain(0.18);
      break;
    case 'INTRO':
      audio?.setRain(0);
      audio?.setAmbience(0.2);
      screenCtl = showIntro({
        flashing, heart: heartOn, replay: !!replay, baselineBpm: cal.baselineBpm,
        onToggle: (k) => toggleOption(k),
        onStart: () => startPlay(),
      });
      break;
    case 'PLAY':
      clear();
      break;
    case 'PAUSED_NO_FACE':
      mount(`<h2>Paused</h2><p>The camera lost your face. Sit back in front of it and the game will continue.</p><p class="small" id="ph"></p>`);
      break;
    case 'WIN':
      clear();
      audio?.chime();
      audio?.silenceAll();
      break;
    case 'LOSE':
      clear();
      if (!scareDone) {
        scareDone = true;
        const f = $('flash');
        f.className = flashing ? 'scare' : 'scare noflash';
        audio?.scare();
        setTimeout(() => { f.className = ''; }, TUNING.jumpScareMs + 50);
      }
      audio?.silenceAll();
      break;
    case 'DEBRIEF':
      audio?.silenceAll();
      showDebrief({
        samples, events: game.events, outcome, baseline: cal.baselineBpm, canSave: runEvents.length > 0 && !replay,
        onReplay: () => { if (replay) { void bootReplay(); } else go('INTRO'); },
        onSave: () => window.peek.saveRun(serializeRun({
          type: 'header', app: 'peek', version: config.version, createdAt: new Date().toISOString(), source: 'live', calibration: cal,
        }, runEvents)),
        onDelete: async () => {
          runEvents = []; samples = []; game = newGame();
          return window.peek.deleteRuns();
        },
        onQuit: () => window.peek.quit(),
      });
      break;
  }
}

function toggleOption(k: 'flashing' | 'heart') {
  if (k === 'flashing') { flashing = !flashing; store.set('peek.flashing', flashing ? 'on' : 'off'); }
  else { heartOn = !heartOn; store.set('peek.heart', heartOn ? 'on' : 'off'); }
  scene.flashing = flashing;
  screenCtl?.sync?.({ flashing, heart: heartOn });
}

function ensureAudio() {
  if (!audio) audio = new GameAudio();
  audio.resume();
}

async function startCameraCheck() {
  presage ??= new Presage(config.apiKey!, onRaw);
  // Camera labels only appear after a first permission grant.
  let cams = await listCameras();
  if (cams.every((c) => !c.label || c.label === 'Camera')) {
    try { (await navigator.mediaDevices.getUserMedia({ video: true })).getTracks().forEach((t) => t.stop()); } catch { /* denied */ }
    cams = await listCameras();
  }
  const saved = store.get('peek.camera');
  let selected = cams.find((c) => c.deviceId === saved)?.deviceId ?? cams[0]?.deviceId ?? null;
  const startCam = async (id: string | null) => {
    try {
      await presage!.start(id);
      const v = $('preview') as HTMLVideoElement;
      v.srcObject = presage!.stream;
      void v.play();
      $('cam-badge').hidden = false;
    } catch (e) {
      presage!.status.error = `Could not start the camera: ${(e as Error).message}`;
    }
  };
  screenCtl = showCameraCheck({
    cameras: cams, selected,
    lidNote: simLid ? (config.lidError ?? 'Lid sensor not available.') : null,
    onCamera: (id) => { selected = id; store.set('peek.camera', id); void startCam(id); },
    onContinue: () => go('CALIBRATE_LID'),
  });
  await startCam(selected);
}

function startPlay() {
  ensureAudio();
  game = newGame();
  runEvents = [];
  samples = [];
  lastSampleT = -Infinity;
  simT = 0;
  acc = 0;
  outcome = 'none';
  scareDone = false;
  scene.lightsOn = 0;
  audio?.unsilence();
  audio?.setAmbience(0.25);
  playStart = performance.now();
  if (replay) {
    bus.setCalibration(cal);
    feeder = new ReplayFeeder(replay.events, bus, playStart);
  }
  go('PLAY');
}

function panic() {
  if (state === 'PLAY' || state === 'PAUSED_NO_FACE') {
    outcome = 'panic';
    game.events.push({ kind: 'panic', t: playStart + simT } as GameEvent);
    go('DEBRIEF');
  } else if (state !== 'DEBRIEF' && state !== 'CONSENT' && state !== 'ERROR' && state !== 'BOOT') {
    outcome = state === 'WIN' ? 'won' : state === 'LOSE' ? 'lost' : 'panic';
    go('DEBRIEF');
  }
}

// ---------------------------------------------------------------- main loop

let lastT = performance.now();
function loop(now: number) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;

  if (simLid && !replay) {
    if (keysDown.has('ArrowUp')) simDeg = Math.min(130, simDeg + 90 * dt);
    if (keysDown.has('ArrowDown')) simDeg = Math.max(0, simDeg - 90 * dt);
    onRaw({ kind: 'lid', t: now, deg: simDeg });
  }

  if (state === 'PLAY' || state === 'PAUSED_NO_FACE') {
    acc += dt * 1000;
    while (acc >= STEP_MS) {
      acc -= STEP_MS;
      const clock = playStart + simT + STEP_MS;
      feeder?.feedUntil(simT + STEP_MS);
      frame = bus.tick(replay ? clock : Math.max(clock, now));
      if (state === 'PAUSED_NO_FACE') {
        if (frame.face === 'ok') go('PLAY');
        continue; // the game and the ghost freeze
      }
      if (!replay && frame.faceLostMs > TUNING.faceLostPauseMs) { go('PAUSED_NO_FACE'); continue; }
      simT += STEP_MS;
      const before = game.distance;
      step(game, frame, STEP_MS / 1000, TUNING, clock);
      if (frame.blinkEvent && frame.lidZone !== 'shut' && game.distance < before) audio?.lurch();
      if (game.events.length && game.events[game.events.length - 1].kind === 'clue' && game.events[game.events.length - 1].t === clock) audio?.chime();
      if (clock - lastSampleT >= 250) {
        lastSampleT = clock;
        samples.push({ t: clock, pulse: frame.pulseBpm, distance: game.distance, zone: frame.lidZone });
      }
      if (game.phase === 'won') { outcome = 'won'; go('WIN'); break; }
      if (game.phase === 'lost') { outcome = 'lost'; go('LOSE'); break; }
    }
    if (replay && feeder?.done && state === 'PLAY' && simT > feeder.duration + 3000) { outcome = 'panic'; go('DEBRIEF'); }
  } else {
    frame = bus.tick(now);
  }

  // Per-state updates.
  if (state === 'CAMERA_CHECK') (screenCtl?.update as ((p: unknown, f: SignalFrame) => void) | undefined)?.(presage?.status ?? null, frame);
  if (state === 'CALIBRATE_LID') (screenCtl?.update as ((d: number) => void) | undefined)?.(frame.lidDeg);
  if (state === 'CALIBRATE_BASELINE') {
    if (frame.face === 'ok') { baselineMs += dt * 1000; baselineRec.push(frame); }
    (screenCtl?.update as ((p: number, f: SignalFrame, h: string) => void) | undefined)?.(baselineMs / BASELINE_MS, frame, presage?.status.hint ?? '');
    if (baselineMs >= BASELINE_MS || now - stateT > BASELINE_MAX_MS) {
      const r = baselineRec.result();
      cal = { ...cal, baselineBpm: r.baselineBpm, breathAmp: r.breathAmp };
      bus.setCalibration(cal);
      go('INTRO');
    }
  }
  if (state === 'PAUSED_NO_FACE') { const ph = document.getElementById('ph'); if (ph) ph.textContent = presage?.status.hint ?? ''; }
  if (state === 'WIN') {
    scene.lightsOn = Math.min(1, scene.lightsOn + dt / 2);
    if (now - stateT > 3500) go('DEBRIEF');
  }
  if (state === 'LOSE' && now - stateT > TUNING.jumpScareMs + 600) go('DEBRIEF');

  // Eyelids, shut-eye blackout, play UI.
  const inGame = state === 'PLAY' || state === 'PAUSED_NO_FACE' || state === 'CALIBRATE_LID' || state === 'INTRO';
  const squint = inGame ? frame.squint : 0;
  const shut = inGame && frame.lidZone === 'shut';
  const lidPct = 100 - squint * 82; // lids leave a narrow slit at the squint floor
  (document.querySelector('.lid.top') as HTMLElement).style.transform = `translateY(-${lidPct}%)`;
  (document.querySelector('.lid.bottom') as HTMLElement).style.transform = `translateY(${lidPct}%)`;
  $('vignette').style.opacity = String(0.5 + squint * 0.5);
  $('shut').style.opacity = shut && state !== 'CALIBRATE_LID' ? '1' : '0';

  if (state === 'PLAY') {
    const steady = game.phase === 'steady';
    $('objective').textContent = steady
      ? 'Open your eyes. Look at it. Steady yourself.'
      : `Squint to read the writing on the walls (${game.cluesFound}/${TUNING.clueCount})`;
    ($('meter-fill') as HTMLElement).style.width = `${(steady ? game.steadyProgress : game.clueProgress) * 100}%`;
    const lastClue = [...game.events].reverse().find((e) => e.kind === 'clue');
    const clueMsg = lastClue && playStart + simT - lastClue.t < 3500 ? `"${CLUES[(lastClue as { index: number }).index]}"` : '';
    $('prompt').textContent = game.breathPrompt ? 'Breathe normally.'
      : frame.breathHolding && game.distance < TUNING.breathHideRange ? 'It has lost you...'
        : clueMsg;
  }

  // Scene and sound.
  const pulseFactor = frame.pulseDelta == null ? 0 : Math.max(0, Math.min(1, frame.pulseDelta / TUNING.pulseFullDelta));
  scene.render({
    t: now / 1000, dt, distance: game.distance, velocity: state === 'PLAY' ? game.velocity : 0,
    squint, clueIndex: state === 'PLAY' && game.phase === 'clues' ? game.cluesFound : -1,
    cluesFound: game.cluesFound, clueProgress: game.clueProgress, pulseFactor,
  });
  if (audio) {
    const live = state === 'PLAY' || state === 'CALIBRATE_BASELINE' || state === 'INTRO';
    audio.heartMuted = !heartOn;
    audio.update({ bpm: frame.pulseBpm, heartOn: live, distance: game.distance, velocity: state === 'PLAY' ? game.velocity : 0, shut });
    if (state === 'PLAY') audio.setAmbience(0.2 + 0.35 * Math.max(0, 1 - game.distance / 10) + 0.15 * pulseFactor);
  }

  hud.update(frame, {
    presage: presage?.status ?? null, lidSource: replay ? 'replay' : simLid ? 'keys' : 'hinge', distance: game.distance,
    velocity: game.velocity, state, trace: bus.breathTrace(), baselineBpm: cal.baselineBpm, holdS: game.holdS,
  });
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- input

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Escape') { e.preventDefault(); panic(); return; }
  keysDown.add(e.code);
  if (e.code === 'KeyD' && !e.metaKey) hud.toggle();
  if (e.code === 'KeyF' && state === 'INTRO') toggleOption('flashing');
  if (e.code === 'KeyM') { if (state === 'INTRO') toggleOption('heart'); else { heartOn = !heartOn; store.set('peek.heart', heartOn ? 'on' : 'off'); } }
  if (e.code === 'Enter') {
    if (state === 'CALIBRATE_LID') { e.preventDefault(); screenCtl?.enter?.(); }
    else if (state === 'INTRO') { e.preventDefault(); startPlay(); }
  }
  // Developer shortcut: skip the 60 s baseline (debug mode only).
  if (e.code === 'KeyS' && config.debug && state === 'CALIBRATE_BASELINE') baselineMs = BASELINE_MS;
});
window.addEventListener('keyup', (e) => keysDown.delete(e.code));
window.addEventListener('blur', () => keysDown.clear());

// ---------------------------------------------------------------- boot

async function bootReplay() {
  replay = parseRun(config.replay!.text);
  cal = { ...replay.header.calibration };
  bus.setCalibration(cal);
  $('replay-badge').hidden = false;
  $('replay-badge').textContent = `REPLAY ${replay.header.source === 'synthetic' ? '(synthetic)' : ''}`;
  go('INTRO');
}

async function boot() {
  config = await window.peek.config();
  console.log('[peek] presage bridge:', typeof (window as unknown as { __smartspectraBridge?: unknown }).__smartspectraBridge, 'lid:', config.lidSource);
  scene.flashing = flashing;
  hud.toggle(config.debug);
  simLid = config.lidSource === 'simulator';
  const savedLid = store.get('peek.lidcal');
  if (savedLid) { try { cal = { ...cal, ...JSON.parse(savedLid) }; bus.setCalibration(cal); } catch { /* ignore */ } }
  if (!simLid) window.peek.onLid((deg) => onRaw({ kind: 'lid', t: performance.now(), deg }));
  requestAnimationFrame(loop);
  if (config.replay) {
    ensureAudio();
    await bootReplay();
    setTimeout(() => { if (state === 'INTRO') startPlay(); }, 4000);
    return;
  }
  if (!config.apiKey) { state = 'ERROR'; showMissingKey(() => window.peek.quit()); return; }
  go('CONSENT');
}

void boot();

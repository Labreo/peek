// Peek renderer: the state machine (PEEK_PLAN.md Section 7.2, extended with chapters).
// BOOT -> CONSENT -> CAMERA_CHECK -> CALIBRATE_LID -> CALIBRATE_BASELINE -> INTRO
//      -> CHAPTER_CARD -> PLAY -> WIN -> CHAPTER_CARD (next chapter) ... -> DEBRIEF
//                              -> LOSE -> DEBRIEF -> Retry chapter -> CHAPTER_CARD
// Any state -> PANIC_EXIT on Space or Esc -> DEBRIEF
// PLAY -> PAUSED_NO_FACE if the face is lost for more than 3 s

import { BaselineRecorder, SignalBus } from '../shared/signalBus';
import { nextChapter, parseRun, ReplayFeeder, serializeRun, STEP_MS, type Run } from '../shared/run';
import type { Calibration, GameEvent, PeekConfig, RawEvent, SignalFrame } from '../shared/types';
import type { PeekApi } from '../preload/preload';
import { GameAudio } from './game/audio';
import { newGame, step, type GameState } from './game/model';
import { RoomScene } from './game/scene';
import { CHAPTERS, chapterTuning, TUNING } from './game/tuning';
import { DebugHud } from './hud/debug';
import { PresenterView } from './hud/presenter';
import { listCameras, openPresenterCamera, Presage } from './presage';
import { showBaseline, BASELINE_MAX_MS, BASELINE_MS } from './screens/baseline';
import { showCalibrateLid } from './screens/calibrateLid';
import { showCameraCheck } from './screens/cameraCheck';
import { showChapterCard } from './screens/chapterCard';
import { showConsent, showMissingKey } from './screens/consent';
import { showDebrief, type Sample } from './screens/debrief';
import { showIntro } from './screens/intro';
import { clear, mount } from './screens/mount';

declare global { interface Window { peek: PeekApi } }

type State =
  | 'BOOT' | 'CONSENT' | 'CAMERA_CHECK' | 'CALIBRATE_LID' | 'CALIBRATE_BASELINE' | 'INTRO'
  | 'CHAPTER_CARD' | 'PLAY' | 'PAUSED_NO_FACE' | 'WIN' | 'LOSE' | 'DEBRIEF' | 'ERROR';

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
const presenter = new PresenterView($('presenter'));
let frame: SignalFrame = bus.tick(performance.now());

// Lid simulator (arrow keys) when there is no sensor.
let simLid = false;
let simDeg = 110;
const keysDown = new Set<string>();

// Options.
let flashing = store.get('peek.flashing') !== 'off';
let heartOn = store.get('peek.heart') !== 'off';

// Session state. One session = chapters played back to back, with retries after a loss.
let startChapter = 0;      // debug: choose with keys 1 to 3 on the intro screen
let chapterIdx = 0;
let game: GameState = newGame(0);
let sessionEvents: GameEvent[] = []; // events from finished chapter attempts
let playStart = 0;         // clock value when the session's first PLAY began
let sessionStarted = false;
let simT = 0;              // ms of play time (excludes cards, pauses and endings)
let acc = 0;
let offPlayMs = 0;         // wall time spent outside PLAY since the session started
let offStart = 0;
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
let cameraId: string | null = null;
let cardAuto = 0;          // ms after which a chapter card continues on its own (0 = wait for Enter)
let lastLoss = false;

const playClock = () => playStart + simT;
const allEvents = () => [...sessionEvents, ...game.events];

function onRaw(e: RawEvent) {
  bus.push(e);
  // Recorded times skip everything outside PLAY, so a replay plays back continuously.
  if (state === 'PLAY') runEvents.push({ ...e, t: e.t - playStart - offPlayMs });
}

function go(next: State) {
  const prev = state;
  const now = performance.now();
  if (sessionStarted && prev === 'PLAY' && next !== 'PLAY') offStart = now;
  if (sessionStarted && prev !== 'PLAY' && next === 'PLAY') offPlayMs += now - offStart;
  state = next;
  stateT = now;
  screenCtl = null;
  $('play-ui').hidden = next !== 'PLAY';
  switch (next) {
    case 'CONSENT':
      showConsent(() => { ensureAudio(); go('CAMERA_CHECK'); }, () => window.peek.quit());
      break;
    case 'CAMERA_CHECK':
      void startCameraCheck();
      break;
    case 'CALIBRATE_LID':
      screenCtl = showCalibrateLid((openDeg, squintFloorDeg) => {
        cal = { ...cal, openDeg, squintFloorDeg };
        bus.setCalibration(cal);
        store.set('peek.lidcal', JSON.stringify({ openDeg, squintFloorDeg }));
        go('CALIBRATE_BASELINE');
      });
      break;
    case 'CALIBRATE_BASELINE':
      baselineMs = 0;
      baselineRec = new BaselineRecorder();
      screenCtl = showBaseline();
      audio?.setRain(0.18);
      break;
    case 'INTRO':
      audio?.setRain(0);
      audio?.setAmbience(0.2);
      scene.setChapter(startChapter);
      screenCtl = showIntro({
        flashing, heart: heartOn, replay: !!replay, baselineBpm: cal.baselineBpm,
        chapters: CHAPTERS.length, startChapter: startChapter + 1, debug: config.debug && !replay,
        onToggle: (k) => toggleOption(k),
        onStart: () => startSession(),
      });
      break;
    case 'CHAPTER_CARD': {
      audio?.silenceAll();
      scene.setChapter(chapterIdx);
      const prevCh = chapterIdx > 0 && !lastLoss ? CHAPTERS[chapterIdx - 1] : null;
      cardAuto = replay ? 5000 : 0;
      screenCtl = showChapterCard({
        index: chapterIdx, total: CHAPTERS.length, chapter: CHAPTERS[chapterIdx],
        previousOutro: prevCh?.outro ?? null, retry: lastLoss, onGo: () => beginChapter(),
      });
      break;
    }
    case 'PLAY':
      clear();
      break;
    case 'PAUSED_NO_FACE':
      mount(`<h2>Paused</h2><p>The camera lost your face. Sit back in front of it and the game will continue.</p><p class="small" id="ph"></p>
        <p class="small">Measurement stopped, or the camera was unplugged? Fix it, then press <span class="kbd">Enter</span> to restart the camera.</p>`);
      break;
    case 'WIN':
      clear();
      audio?.chime();
      audio?.silenceAll();
      break;
    case 'LOSE':
      clear();
      if (!scareDone) {
        scareDone = true; // at most one jump scare per session (Section 13)
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
        samples, events: allEvents(), outcome, baseline: cal.baselineBpm, canSave: runEvents.length > 0 && !replay,
        chapterReached: chapterIdx + 1, chapters: CHAPTERS.length,
        cleared: allEvents().filter((e) => e.kind === 'win').length,
        onRetry: outcome === 'lost' ? () => retryChapter() : null,
        onReplay: () => { if (replay) { void bootReplay(); } else go('INTRO'); },
        onSave: () => window.peek.saveRun(serializeRun({
          type: 'header', app: 'peek', version: config.version, createdAt: new Date().toISOString(), source: 'live',
          calibration: cal, startChapter,
        }, runEvents)),
        onDelete: async () => {
          runEvents = []; samples = []; sessionEvents = []; game = newGame(chapterIdx);
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

let cameraLabel: string | undefined;
/** True when the sensing camera is the MacBook's own, which the lid points away from the face. */
const builtInCamera = () => /facetime|built-in/i.test(cameraLabel ?? '');

/** Start (or restart) measuring. Used by the camera check, its Try again button and the pause screen. */
async function startCam(id: string | null) {
  if (!presage) return;
  try {
    await presage.start(id);
    $('cam-badge').hidden = false;
    $('cam-badge-name').textContent = cameraLabel ?? 'camera';
    void syncPresenterCamera();
  } catch (e) {
    presage.status.error = `Could not start the camera: ${(e as Error).message}`;
  }
}

// Presenter view: the player's face from a second camera (never the sensing one), only while the view is on.
let presenterStream: MediaStream | null = null;
async function syncPresenterCamera() {
  const want = presenter.visible && config.preview && !replay && !!presage && state !== 'CONSENT' && state !== 'BOOT';
  if (want && !presenterStream) {
    presenterStream = await openPresenterCamera(cameraLabel);
    presenter.setStream(presenterStream);
  } else if (!want && presenterStream) {
    presenterStream.getTracks().forEach((t) => t.stop());
    presenterStream = null;
    presenter.setStream(null);
  }
}

async function startCameraCheck() {
  presage ??= new Presage(onRaw);
  const cams = await listCameras();
  const saved = store.get('peek.camera');
  const pick = cams.find((c) => c.deviceId === saved) ?? cams[0];
  cameraId = pick?.deviceId ?? null;
  cameraLabel = pick?.label;
  screenCtl = showCameraCheck({
    cameras: cams, selected: cameraId,
    lidNote: simLid ? (config.lidError ?? 'Lid sensor not available.') : null,
    onCamera: (id) => {
      cameraId = id;
      cameraLabel = cams.find((c) => c.deviceId === id)?.label;
      store.set('peek.camera', id);
      void startCam(id);
    },
    onRetry: () => void startCam(cameraId),
    onContinue: () => go('CALIBRATE_LID'),
  });
  await startCam(cameraId);
}

/** A new session from the intro: chapter 1 (or the debug start chapter), fresh recording. */
function startSession() {
  ensureAudio();
  chapterIdx = startChapter;
  game = newGame(chapterIdx);
  sessionEvents = [];
  runEvents = [];
  samples = [];
  lastSampleT = -Infinity;
  simT = 0;
  acc = 0;
  offPlayMs = 0;
  sessionStarted = false;
  outcome = 'none';
  scareDone = false;
  lastLoss = false;
  feeder = null;
  go('CHAPTER_CARD');
}

/** Start (or restart) the current chapter after its card. */
function beginChapter() {
  if (state !== 'CHAPTER_CARD') return;
  game = newGame(chapterIdx);
  scene.lightsOn = 0;
  audio?.unsilence();
  audio?.setAmbience(0.25);
  if (!sessionStarted) {
    playStart = performance.now();
    sessionStarted = true;
    if (replay) {
      bus.setCalibration(cal);
      feeder = new ReplayFeeder(replay.events, bus, playStart);
    }
  }
  sessionEvents.push({ kind: 'chapter', t: playClock(), chapter: chapterIdx });
  go('PLAY');
}

function retryChapter() {
  lastLoss = true;
  go('CHAPTER_CARD');
}

/** Archive the finished attempt and decide what comes next. */
function endAttempt() {
  sessionEvents.push(...game.events);
  game.events = [];
  const next = nextChapter(game);
  if (game.phase === 'won') {
    lastLoss = false;
    if (next == null) { outcome = 'won'; go('DEBRIEF'); }
    else { chapterIdx = next; go('CHAPTER_CARD'); }
  }
}

function panic() {
  if (state === 'PLAY' || state === 'PAUSED_NO_FACE') {
    outcome = 'panic';
    game.events.push({ kind: 'panic', t: playClock() });
    go('DEBRIEF');
  } else if (state !== 'DEBRIEF' && state !== 'CONSENT' && state !== 'ERROR' && state !== 'BOOT') {
    if (state === 'LOSE') outcome = 'lost';
    else if (outcome === 'none') outcome = 'panic';
    go('DEBRIEF');
  }
}

// ---------------------------------------------------------------- main loop

let lastT = performance.now();
function loop(now: number) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const tune = chapterTuning(chapterIdx);
  const ch = CHAPTERS[chapterIdx];

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
      // With the laptop's own camera, lowering the lid blinds it: that is expected, so only pause
      // when the face is lost with the lid open. The game keeps the last pulse meanwhile.
      const blindByLid = builtInCamera() && frame.lidZone !== 'open';
      if (!replay && !blindByLid && frame.faceLostMs > TUNING.faceLostPauseMs) { go('PAUSED_NO_FACE'); continue; }
      simT += STEP_MS;
      const before = game.distance;
      const nEv = game.events.length;
      step(game, frame, STEP_MS / 1000, tune, clock);
      if (frame.blinkEvent && frame.lidZone !== 'shut' && game.distance < before) audio?.lurch();
      if (frame.startleEvent && frame.lidZone !== 'shut') scene.stutter();
      if (game.events.slice(nEv).some((e) => e.kind === 'clue')) audio?.chime();
      if (clock - lastSampleT >= 250) {
        lastSampleT = clock;
        samples.push({ t: clock, pulse: frame.pulseBpm, distance: game.distance, zone: frame.lidZone, chapter: chapterIdx });
      }
      if (game.phase === 'won') { go('WIN'); break; }
      if (game.phase === 'lost') { outcome = 'lost'; sessionEvents.push(...game.events); game.events = []; go('LOSE'); break; }
    }
    if (replay && feeder?.done && state === 'PLAY' && simT > feeder.duration + 3000) { if (outcome === 'none') outcome = 'panic'; go('DEBRIEF'); }
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
  if (state === 'CHAPTER_CARD' && cardAuto && now - stateT > cardAuto) beginChapter();
  if (state === 'PAUSED_NO_FACE') { const ph = document.getElementById('ph'); if (ph) ph.textContent = presage?.status.error ?? presage?.status.hint ?? ''; }
  if (state === 'WIN') {
    scene.lightsOn = Math.min(1, scene.lightsOn + dt / 2);
    if (now - stateT > 3500) endAttempt();
  }
  if (state === 'LOSE' && now - stateT > TUNING.jumpScareMs + 600) {
    // A replay mirrors the recording: if events continue, the player pressed Retry.
    if (replay && feeder && !feeder.done) retryChapter(); else go('DEBRIEF');
  }

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
    $('objective').textContent = `${ch.title}: ` + (steady
      ? 'open your eyes, look at it, steady yourself'
      : `squint to read the writing (${game.cluesFound}/${tune.clueCount})`);
    ($('meter-fill') as HTMLElement).style.width = `${(steady ? game.steadyProgress : game.clueProgress) * 100}%`;
    const lastClue = [...game.events].reverse().find((e) => e.kind === 'clue') as { t: number; index: number } | undefined;
    const clueMsg = lastClue && playClock() - lastClue.t < 3500 ? `"${ch.clues[lastClue.index].text}"` : '';
    $('prompt').textContent = game.breathPrompt ? 'Breathe normally.'
      : game.blackout ? 'Dark. It can move.'
        : game.blackoutWarn ? 'The bulb is buzzing...'
          : frame.breathHolding && game.distance < tune.breathHideRange ? 'It has lost you...'
            : clueMsg;
  }

  // Scene and sound.
  const playing = state === 'PLAY';
  const pulseFactor = frame.pulseDelta == null ? 0 : Math.max(0, Math.min(1, frame.pulseDelta / TUNING.pulseFullDelta));
  scene.render({
    t: now / 1000, dt, distance: game.distance, velocity: playing ? game.velocity : 0,
    squint, clueIndex: playing && game.phase === 'clues' ? game.cluesFound : -1,
    cluesFound: game.cluesFound, clueProgress: game.clueProgress, pulseFactor,
    blackout: playing && game.blackout, blackoutWarn: playing && game.blackoutWarn, side: game.side,
  });
  if (audio) {
    const live = playing || state === 'CALIBRATE_BASELINE' || state === 'INTRO';
    audio.heartMuted = !heartOn;
    audio.update({ bpm: frame.pulseBpm, heartOn: live, distance: game.distance, velocity: playing ? game.velocity : 0, shut });
    if (playing) {
      audio.setAmbience(0.2 + 0.35 * Math.max(0, 1 - game.distance / 10) + 0.15 * pulseFactor);
      audio.setBuzz(game.blackoutWarn ? 1 : 0);
      audio.setProjector(ch.env.projector && !game.blackout ? 1 : 0);
      audio.ambientThuds(chapterIdx >= 1);
    }
  }

  presenter.update(frame, {
    hasCamera: !!presenterStream,
    replay: !!replay,
    label: playing && game.blackout ? 'LAMP DIED' : state === 'PAUSED_NO_FACE' ? 'FACE LOST' : null,
  });

  hud.update(frame, {
    presage: presage?.status ?? null, lidSource: replay ? 'replay' : simLid ? 'keys' : 'hinge', distance: game.distance,
    velocity: game.velocity, state: `${state} ch${chapterIdx + 1}${game.blackout ? ' DARK' : ''}`, trace: bus.breathTrace(),
    baselineBpm: cal.baselineBpm, holdS: game.holdS,
  });
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- input

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Escape') { e.preventDefault(); panic(); return; }
  keysDown.add(e.code);
  if (e.code === 'KeyD' && !e.metaKey) hud.toggle();
  if (e.code === 'KeyV' && !e.metaKey) { presenter.toggle(); void syncPresenterCamera(); }
  if (e.code === 'KeyF' && state === 'INTRO') toggleOption('flashing');
  if (e.code === 'KeyM') { if (state === 'INTRO') toggleOption('heart'); else { heartOn = !heartOn; store.set('peek.heart', heartOn ? 'on' : 'off'); } }
  // Debug: pick the starting chapter on the intro screen.
  if (state === 'INTRO' && config.debug && !replay && /^Digit[1-9]$/.test(e.code)) {
    const n = Number(e.code.slice(5)) - 1;
    if (n < CHAPTERS.length) { startChapter = n; go('INTRO'); }
  }
  if (e.code === 'Enter') {
    if (state === 'CALIBRATE_LID') { e.preventDefault(); screenCtl?.enter?.(); }
    else if (state === 'INTRO') { e.preventDefault(); startSession(); }
    else if (state === 'CHAPTER_CARD') { e.preventDefault(); beginChapter(); }
    else if (state === 'PAUSED_NO_FACE' && presage) { e.preventDefault(); void startCam(cameraId); }
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
  startChapter = replay.header.startChapter ?? 0;
  bus.setCalibration(cal);
  $('replay-badge').hidden = false;
  $('replay-badge').textContent = `REPLAY ${replay.header.source === 'synthetic' ? '(synthetic)' : ''}`;
  go('INTRO');
  setTimeout(() => { if (state === 'INTRO') startSession(); }, 4000);
}

async function boot() {
  config = await window.peek.config();
  console.log('[peek] capture: native (main process), lid:', config.lidSource);
  scene.flashing = flashing;
  hud.toggle(config.debug);
  presenter.toggle(config.presenter);
  simLid = config.lidSource === 'simulator';
  const savedLid = store.get('peek.lidcal');
  if (savedLid) { try { cal = { ...cal, ...JSON.parse(savedLid) }; bus.setCalibration(cal); } catch { /* ignore */ } }
  if (!simLid) window.peek.onLid((deg) => onRaw({ kind: 'lid', t: performance.now(), deg }));
  requestAnimationFrame(loop);
  if (config.replay) {
    ensureAudio();
    await bootReplay();
    return;
  }
  if (!config.apiKey) { state = 'ERROR'; showMissingKey(() => window.peek.quit()); return; }
  go('CONSENT');
}

void boot();

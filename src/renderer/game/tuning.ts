// Every gameplay constant in one place. Retune after playtests.

export const TUNING = {
  startDistance: 10.0,   // m
  loseDistance: 0.8,     // m
  maxDistance: 12.0,

  speedBase: 0.05,       // m/s creep while squinting
  squintPulseGain: 0.15, // extra m/s at +20 bpm while squinting
  shutBase: 0.4,         // m/s rush while eyes are shut
  shutPulseGain: 0.4,
  pulseFullDelta: 20,    // bpm above baseline that counts as "full" pulse factor
  blinkLurch: 0.25,      // m per blink (people blink ~15 times a minute)
  watchRetreat: 0.15,    // m/s it backs off while you hold a calm, unbroken gaze
  watchRetreatAfterS: 1, // ...after this long without blinking
  watchCalmFull: 4,      // full retreat speed with the pulse up to this far above baseline
  watchCalmZero: 15,     // ...fading to no retreat at this far above baseline

  breathHideRange: 3.0,  // breath holding works when the ghost is closer than this
  breathDriftSpeed: -0.3,
  // Safety (Section 13): detection lands about 4 s into a hold, so a 4 s cap keeps the
  // whole hold near 8 s. At the cap the ghost leaves anyway and we say "Breathe normally".
  breathHoldCapS: 4,
  breathCapPushTo: 6.0,  // where the ghost retreats to when the cap is reached

  clueCount: 3,
  clueReadS: 3,        // seconds of squinting to read one clue
  clueRevealMin: 0.35,   // squint amount needed to see the writing
  steadyDeltaBpm: 3,     // win: pulse within baseline + this
  steadyHoldS: 8,        // ...for this long, lid open, looking at it
  steadyNoPulseOk: false,

  // Lamp blackouts (chapter 2 on): in the dark you cannot watch it, so it creeps.
  blackoutEveryS: 0,     // 0 = never
  blackoutFirstS: 20,
  blackoutDurS: 3,
  blackoutWarnS: 1.5,    // the bulb buzzes this long before it dies

  relocates: false,      // chapter 3: it changes aisle position each time you shut your eyes

  faceLostPauseMs: 3000,
  jumpScareMs: 1200,     // under 1.5 s
  jumpScareGain: 0.35,   // master volume cap during the scare
};

export type Tuning = typeof TUNING;

export interface ClueSpot { pos: [number, number, number]; rotY: number; w: number; h: number; }

export interface Chapter {
  title: string;
  /** Shown on the card before the chapter starts: the new rule, in one or two sentences. */
  rule: string;
  /** Story text shown after the chapter is cleared. */
  outro: string;
  clues: { text: string; spot: ClueSpot }[];
  tune: Partial<Tuning>;
  env: {
    seed: number;
    aisle: number;        // aisle length in m
    fog: number;          // fog color
    fogDensity: number;
    lamp: number;         // desk lamp color
    back: number;         // light at the end of the aisle
    reels: number;        // 0..1 share of film reels on the shelves
    projector: boolean;   // a flickering projector beam at the far end
    wall: number;
  };
}

const L = (x: number, y: number, z: number, w = 1.5): ClueSpot => ({ pos: [-x, y, z], rotY: 0.55, w, h: w / 4 });
const R = (x: number, y: number, z: number, w = 1.5): ClueSpot => ({ pos: [x, y, z], rotY: -0.55, w, h: w / 4 });
const B = (y: number, z: number, w = 2.6): ClueSpot => ({ pos: [0, y, z], rotY: 0, w, h: w / 4 });

export const CHAPTERS: Chapter[] = [
  {
    title: 'The Reading Room',
    rule: 'Find the 3 messages. Squint to read them. Keep your eyes on it the rest of the time.',
    outro: 'Someone was here before you. They left notes for whoever came next.',
    clues: [
      { text: 'IT MOVES WHEN YOU BLINK', spot: L(0.72, 1.55, -3.6) },
      { text: 'HOLD YOUR BREATH WHEN IT IS CLOSE', spot: R(0.72, 1.25, -4.8) },
      { text: 'LOOK AT IT. BE STILL.', spot: B(2.15, -12.9) },
    ],
    tune: { clueReadS: 4 },
    env: { seed: 42, aisle: 13, fog: 0x050506, fogDensity: 0.11, lamp: 0xffc68a, back: 0x8090b0, reels: 0.3, projector: false, wall: 0x2a2620 },
  },
  {
    title: 'The Stacks',
    rule: 'The lamp is failing. When the bulb buzzes, it is about to go dark, and in the dark you cannot watch it.',
    outro: 'The notes get shakier here. Whoever wrote them was running out of time.',
    clues: [
      { text: 'THE LAMP WILL FAIL. DO NOT PANIC', spot: L(0.72, 1.7, -3.0) },
      { text: 'IT FILES AWAY THOSE WHO LOOK AWAY', spot: R(0.72, 1.4, -4.2) },
      { text: 'MY NAME IS ON A SHELF HERE', spot: L(0.72, 1.0, -6.2) },
      { text: 'IT CANNOT FILE A CALM HEART', spot: B(2.0, -15.9) },
    ],
    tune: { clueCount: 4, clueReadS: 5, speedBase: 0.07, blackoutEveryS: 28, blackoutFirstS: 15, steadyHoldS: 10 },
    env: { seed: 7, aisle: 16, fog: 0x04060a, fogDensity: 0.13, lamp: 0xd8e0ff, back: 0x5a6a90, reels: 0.15, projector: false, wall: 0x1e2228 },
  },
  {
    title: 'The Vault',
    rule: 'It knows you now. Every time you shut your eyes it moves to a new place. The lamp still fails.',
    outro: 'The vault door is open. Behind it, rows and rows of film. One reel has your name on it, and it is empty.',
    clues: [
      { text: 'THE REELS ARE MEMORIES', spot: R(0.72, 1.6, -3.2) },
      { text: 'IT WAS THE FIRST ARCHIVIST', spot: L(0.72, 1.3, -4.4) },
      { text: 'IT IS AFRAID OF BEING SEEN', spot: R(0.72, 0.95, -6.0) },
      { text: 'KEEP YOUR EYES OPEN', spot: L(0.72, 1.85, -7.4) },
      { text: 'THE DOOR OPENS FOR THE STILL', spot: B(2.2, -13.9) },
    ],
    tune: {
      clueCount: 5, clueReadS: 4.5, startDistance: 9, speedBase: 0.065, shutBase: 0.5,
      blackoutEveryS: 35, blackoutFirstS: 25, relocates: true, steadyHoldS: 12,
    },
    env: { seed: 1984, aisle: 14, fog: 0x030805, fogDensity: 0.12, lamp: 0xc8ffb0, back: 0x6a8a60, reels: 0.8, projector: true, wall: 0x1a2018 },
  },
];

export function chapterTuning(i: number): Tuning {
  const c = CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, i))];
  return { ...TUNING, ...c.tune, clueCount: c.clues.length };
}

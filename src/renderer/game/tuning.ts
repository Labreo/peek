// Every gameplay constant in one place (PEEK_PLAN.md Section 7.1). Retune after playtests.

export const TUNING = {
  startDistance: 10.0,   // m
  loseDistance: 0.8,     // m
  maxDistance: 12.0,

  speedBase: 0.05,       // m/s creep while squinting
  squintPulseGain: 0.15, // extra m/s at +20 bpm while squinting
  shutBase: 0.4,         // m/s rush while eyes are shut
  shutPulseGain: 0.4,
  pulseFullDelta: 20,    // bpm above baseline that counts as "full" pulse factor
  blinkLurch: 0.5,       // m per blink

  breathHideRange: 3.0,  // breath holding works when the ghost is closer than this
  breathDriftSpeed: -0.3,
  breathHoldCapS: 8,     // after this the ghost leaves anyway (safety, Section 13)
  breathCapPushTo: 6.0,  // where the ghost retreats to when the cap is reached

  clueCount: 3,
  clueReadS: 2.5,        // seconds of squinting to read one clue
  clueRevealMin: 0.35,   // squint amount needed to see the writing
  steadyDeltaBpm: 3,     // win: pulse within baseline + this
  steadyHoldS: 8,        // ...for this long, lid open, looking at it
  steadyNoPulseOk: false,

  faceLostPauseMs: 3000,
  jumpScareMs: 1200,     // under 1.5 s
  jumpScareGain: 0.35,   // master volume cap during the scare
};

export type Tuning = typeof TUNING;

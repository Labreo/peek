---
title: "Peek: a horror game where your MacBook lid is your eyelids and your pulse sets the ghost's speed"
published: false
tags: devchallenge, presagechallenge, gamedev, electron
cover_image: TODO_cover_from_docs_media
---

<!--
DRAFT. Every TODO needs real numbers or links before publishing.
Rules: keep the headings below in this exact order. No em dashes. No health claims of any kind.
-->

*This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04).*

## What I Built

**Peek is a horror game where your MacBook lid is your eyelids.**

TODO: 10-second GIF (squint, pulse climbing, blink, lurch, lid slam).

Close the lid partway to squint at a dark archive. Shut it to hide. A tall figure called the Archivist stands at the end of the aisle. It cannot move while you watch it. But it moves when you blink, it rushes in when you shut your eyes, and it gets faster as your pulse climbs. The only way out is to find three messages scrawled on the walls, then open your eyes, look straight at it, and calm down.

Horror is about not wanting to look. I wanted a game where *not looking* is a physical act, so your hands do it. The laptop hinge has an angle sensor on M2 and newer MacBooks, and it turned out to make a very convincing eyelid.

The obvious problem: if the lid is your eyelid, the laptop camera goes blind the moment you shut it. So the camera moved. My Pixel 8a sits propped next to the laptop in Android's USB webcam mode, and that is the eye that watches you. Presage's SmartSpectra SDK reads pulse, breathing and blinks from it, on the Mac, while the lid is closed.

The game has three chapters, each deeper into the archive: the Reading Room teaches the rules, in the Stacks the lamp keeps dying (and in the dark you cannot watch it), and in the Vault it moves somewhere new every time you close your eyes. The twelve messages on the walls tell the Archivist's story.

**Inspiration and what is new.** Biofeedback horror is not new: [Nevermind](https://store.steampowered.com/app/342260/Nevermind/) (2015) gets harder as your heart rate rises, and it is the reason I knew this genre could work. Sam Henri Gold's [LidAngleSensor](https://github.com/samhenrigold/LidAngleSensor) showed the hinge sensor could be read at all (and made it creak like a door). What I have not seen before is the combination: the hinge as eyelids, a blink as the monster's movement trigger, holding your breath to hide, and a phone as the sensing eye so you can close the laptop and still be measured.

## Demo

TODO: video embed (YouTube).

TODO: GIF 1, the squint reveal: tilting the lid down makes hidden writing appear on the shelves.

TODO: GIF 2, the blink lurch: one blink, one step closer.

## Code

TODO: {% github Labreo/peek %}

```bash
git clone https://github.com/Labreo/peek.git && cd peek
npm install
cp .env.example .env   # add your free Presage key: PRESAGE_API_KEY=...
npm start              # needs an M2+ MacBook for the lid; arrow keys work otherwise
npm run replay         # no camera, no key, no lid needed: watch a recorded run
```

Replay mode feeds a recorded run (raw lid, pulse, breathing and blink events) through the exact same signal pipeline and game rules, at a fixed 30 Hz step. It is how anyone can see the game work without the hardware, and it doubles as a regression test: the same file always produces the same ending.

## How It Responds to Human Signals

Four live inputs, each with its own job:

| Signal | Source | Mechanic | Latency and how I handle it |
|---|---|---|---|
| Lid angle | MacBook hinge sensor, read at 30 Hz | Open: you are watching, the ghost is frozen. Squint: writing appears but the ghost creeps. Shut: black screen, it rushes in | Near instant. Median filter over 5 samples and 3 degrees of hysteresis so zones do not flicker |
| Blink | Presage `BLINKING` | Each blink while watching lets the ghost lurch 0.5 m | Edge-triggered with a 250 ms refractory period, so one blink is one step |
| Pulse | Presage `PULSE_RATE` | Speed scales with how far you are above your own calm baseline (0 at baseline, full at +20 bpm). To win, you must stay within +3 bpm for 8 s | Slow by nature, so it is the "pressure" input. Only `stable` readings count, smoothed with an EMA |
| Breathing | Presage breathing trace (`upperTrace`) | Hold your breath when it is within 3 m and it loses you and drifts back | Amplitude over a rolling 4 s window must drop below 25% of your calm amplitude for 2.5 s. Capped at 8 s |
| Expression (cosmetic) | Presage `EXPRESSIONS` | A fearful or surprised face makes the desk lamp stutter | Purely visual, never changes the rules |

**The ghost model in plain words.** It starts 10 m away. While your lid is open and you are not blinking, it does not move toward you, and if you hold a calm, unbroken gaze it slowly backs away. While you squint, it creeps at 5 cm per second, plus up to 15 more cm per second if your pulse is up. While your eyes are shut, it moves at 40 to 80 cm per second depending on your pulse. Each blink is an instant 25 cm step. If it is close and you hold your breath, it backs off. It reaches you at 0.8 m.

That creates the tension: you need to squint to read the clues, but squinting lets it creep. Shutting your eyes feels safe and is the most dangerous thing you can do. And the scarier it gets, the faster your pulse, the faster it moves.

**Everything is relative to you.** Before play, a 60 s calm scene (soft rain, lid open) records your median pulse and normal breathing amplitude, and a 15 s lid calibration records your usual open angle and your squint floor.

**Numbers from playtests.** TODO: average pulse rise after shutting the lid, blinks per run, how quickly breath holds were picked up, win rate.

The Presage integration, from [`src/renderer/presage.ts`](https://github.com/Labreo/peek/blob/main/src/renderer/presage.ts):

```ts
const sdk = new SmartSpectraSDK({
  apiKey: this.apiKey,
  requestedMetrics: [...breathingMetrics, MetricType.PULSE_RATE, MetricType.BLINKING, MetricType.EXPRESSIONS],
  enableTelemetry: false, // Peek opts out of Presage's optional SDK telemetry
});
sdk.on('metrics', (buf) => this.onMetrics(buf)); // pulse, breathing trace, blinks -> signal bus
sdk.useMediaStream(phoneCameraStream);            // the Pixel, picked by name
await sdk.start();
```

TODO: screenshot of the debug HUD (press D in game) showing raw Presage values next to the ghost's distance.

**What did not work.** TODO: honest paragraph. Start with: my first plan used the MacBook camera, which goes blind the moment you close the lid, which is the whole game. That is why the phone became the eye.

## Prize Categories

**Most Creative or Delightful Use**: the laptop hinge becomes an eyelid, and three Presage signals each drive a different scare. Blinks move the monster, your pulse sets its speed, and holding your breath hides you.

## Consent and Data Handling

- **Consent:** a plain-language consent card appears before any camera access. The camera only starts after "I agree, start camera". A camera-on indicator stays in the corner the whole time.
- **Processing:** video is processed on the player's own computer by the SmartSpectra SDK. No video is recorded or saved, and Peek never asks the SDK for image output.
- **Storage:** readings live in memory during the session only.
- **Sharing:** none. Peek uploads nothing.
- **Retention:** readings are cleared when you quit. A run file is written only if you press "Save run file" on the debrief screen, and only to `~/Documents/Peek/runs/` on your own computer.
- **Deletion:** quitting clears memory. "Delete my data" on the debrief screen clears the session's readings and deletes every run file Peek created.
- **SDK telemetry:** turned off with `enableTelemetry: false`. Presage's [Telemetry and Privacy doc](https://github.com/Presage-Security/SmartSpectra/blob/main/docs/telemetry-and-privacy.md) says that when disabled, "the SDK starts no telemetry session and transmits nothing." The SDK still contacts Presage's servers to authenticate the API key.
- **AI services:** none.
- **Who is measured:** only the person at the computer. Peek is not designed to measure anyone else, and the debrief is a game recap, not health information.
- **Safety:** a content note before play, flashing can be turned off, one jump scare per run (under 1.5 s, volume capped), breath holding stops working after 8 s with a "Breathe normally" prompt, no mechanic rewards a higher heart rate, and Space or Esc stops the game at any time.

## Agent Session

TODO: upload the Claude Code session (scrub keys first), set it to public, embed it here.

Built solo by TODO_DEV_USERNAME, with help from Claude Code.

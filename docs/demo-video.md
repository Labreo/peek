# Recording the demo video

Peek is a physical game, so the video should show a real person playing: the face, the hands on the lid, the phone watching, and the game reacting. Judges verify the Presage integration from the video, so the live signals must be on screen too.

## The rig

```
            [ second camera ]  side view, about 1.5 m away, sees: your face, the MacBook lid, the Pixel
                   │           (any phone on a stand, recording video)
                   v
  [ Pixel 8a ]   you   [ MacBook ]   <- Peek running with `npm run demo`
  USB webcam,          lid = eyelids
  sensing camera
```

- **Pixel 8a:** the sensing camera Peek uses (USB webcam mode, USB 2.0 cable). Do not move it during takes.
- **Second camera:** films you from the side so viewers see the lid move. A second phone on a stack of books works.
- **Desk lamp** on your face. The game is dark, and both Presage and the second camera need light.
- **Headphones** for you, but the screen recording captures the game sound directly.

## Inside Peek: presenter view

Start with:

```bash
npm run demo
```

This turns on the **presenter view** (toggle with `V`): your live face from the Pixel in the bottom-right corner, with your pulse, a hinge icon that follows the real lid angle, the current zone (WATCHING, SQUINTING, EYES SHUT, LAMP DIED) and a BLINK flash. It sits on top of the shut-eye blackout, so when you lower the lid the game goes black but viewers still see you. The debug overlay (`D`) with the raw Presage values is on too.

The face in the presenter view comes from the **MacBook's own camera**, not the Pixel: nothing else may open the sensing camera while Presage is measuring (a second stream breaks its frame timing, error 11). So the presenter shows you while the lid is open or squinting, and goes dark when the lid is lowered. Your side camera covers those moments. Peek only shows this video on your screen. It does not record or save it. Your screen recorder does.

## Recording: OBS (recommended, one take, already in sync)

OBS records the screen, the game audio and the second camera in one file, so nothing needs lining up later.

1. **Sources:** add *macOS Screen Capture* (Display), add *macOS Audio Capture* (Peek's sound), and add the side camera as a *Video Capture Device*. To use a phone as that camera, connect it as a webcam or with Continuity Camera.
   **Never add the Pixel ("Android Webcam") as an OBS source.** Presage is using it, and a second app opening it stops the measurement (error 11). The side camera must be a different device.
2. **Layout:** the game full screen, with the side camera in the bottom-left corner. The presenter view is already bottom-right.
3. **Output:** 1920x1080, 30 fps, MP4.
4. Do one quiet test take and check that you can hear the heartbeat and footsteps.

## Recording separately (fallback)

1. Record the screen with OBS, or `Cmd+Shift+5` (that one has no game sound unless you add an audio capture tool).
2. Film the side view on the second phone.
3. **Clap once on camera** at the start of both recordings.
4. Combine them:

```bash
scripts/compose-demo.sh screen.mov room.mov demo.mp4 2.4 side   # 2.4 = room clap time minus screen clap time
```

Layouts: `side` (screen plus side view), `pip` (side view in a corner), `stack` (vertical, for shorts).

## Safety while filming

- **Never close the lid all the way.** A fully closed MacBook goes to sleep and the take is lost. "Eyes shut" is anywhere below your squint angle, so stop a hand's width above closed.
- Only you on camera. Peek measures the person at the computer only.
- Keep breath holds short. The game makes you breathe normally after about 8 s anyway.
- Do not commit video files. `.gitignore` already skips `*.mp4` and `*.mov`.

## What the rules ask of the video

From the official challenge page and contest rules (checked 2026-11-22):
- A demo video is **required**. No length or format limit is stated. YouTube unlisted is fine.
- Judges **verify the SmartSpectra SDK use from the repo and the video**. Entries that do not show a functional integration with at least one live Presage signal "may be disqualified". So the live signals must be visible on screen (debug overlay and presenter view).
- No rule requires or forbids showing a person. Showing yourself playing is the clearest proof that the signals are live, and the app is about a physical action. Only you on camera: the rules ban "covert or non-consensual monitoring".
- No health claims in the narration or captions.

Target: **2 to 2.5 minutes**. Captions on screen instead of a voiceover is fine.

## What to record (raw footage)

| Take | What | Length | How |
|---|---|---|---|
| A | **One full real session**: consent, camera check, lid calibration, baseline, chapter 1, into chapter 2 until a blackout | 8 to 10 min raw | `npm run demo` + OBS (screen + game audio + side camera). Play naturally, and make sure each mechanic happens at least once: squint at a message, blink, lower the lid, hold your breath when it is close, the steady ending. At the debrief press **Save run file** |
| B | **B-roll of the rig**, filmed with any phone camera app while Peek is *closed*: slow pan of the Pixel propped up with the cable, the MacBook, your hand lowering the lid, your face lit by the lamp | 30 s | Can be the Pixel's own camera app, since Peek is not running |
| C | **Code**: scroll `src/main/presage.ts` (the SDK options, `enableTelemetry: false`, `useCamera`) and `src/main/lid.ts` | 20 s | Screen recording |
| D | **Backup**: `npm run replay` with the presenter view | 1 min | Only used if A fails. Say on screen that it is a recorded run |

No second camera for the side view? Record Take A with OBS capturing only the screen (the presenter view already shows your face from the MacBook camera), and use Take B for the physical lid shots.

## The cut (beats)

| Time | Beat | On screen | Caption idea |
|---|---|---|---|
| 0:00 | **Hook** | Your face lit by the lamp, lid half down. Pulse in the presenter view climbing. You blink: BLINK flashes, the ghost lurches. You lower the lid: game goes black, footsteps | "Your MacBook lid is your eyelids." |
| 0:12 | **The rig** | B-roll pan: Pixel as the eye, one cable, the MacBook | "The phone watches you. Presage SmartSpectra reads pulse, breathing and blinks. The hinge sensor reads the lid." |
| 0:25 | **Consent and calibration** (sped up 3 to 4x) | Consent card (hold 2 s so it is readable), camera check with the bpm appearing, lid calibration with the angle changing as you tilt | "Consent first. Everything runs on this Mac." |
| 0:45 | **Squint** | Lid tilts down, eyelids close in, a message appears on the shelves | "Squint to read the walls. But it creeps while you squint." |
| 0:57 | **Blink** | Debug overlay blink counter ticks, ghost lurches | "Every blink, it steps closer." |
| 1:07 | **Eyes shut** | Lid lowered, black screen, presenter shows EYES SHUT, footsteps, pulse rising | "Close your eyes and it rushes in." |
| 1:20 | **Hold your breath** | Ghost close, breath trace goes flat in the overlay, "It has lost you..." | "Hold your breath and it loses you." |
| 1:33 | **Chapter 2** | Bulb buzz, blackout, "Dark. It can move." | "Three chapters. The lamp starts failing." |
| 1:43 | **Steady yourself** | Lid open, you looking at it, pulse falling toward baseline, lights come on | "To escape, look at it and calm down." |
| 1:58 | **Debrief** | Pulse chart with markers, then the Delete my data button | "A recap of your run. Nothing is uploaded." |
| 2:10 | **Code** | `presage.ts` and `lid.ts` | "Presage SmartSpectra Node SDK + node-hid." |
| 2:20 | **End card** | Title, repo URL | "Peek. github.com/Labreo/peek" |

Keep the debug overlay (D) visible for most of 0:45 to 1:58: it is how judges see the raw Presage values.

## GIFs and images for the DEV post

Cut them from Take A once it is recorded:

```bash
scripts/clip-gif.sh takeA.mp4 <start> 5 docs/media/hook.gif 900 12     # top of the post: blink lurch + lid slam
scripts/clip-gif.sh takeA.mp4 <start> 4 docs/media/squint.gif 800 12   # squint reveals a message
scripts/clip-gif.sh takeA.mp4 <start> 4 docs/media/breath.gif 800 12   # breath hold, "It has lost you"
scripts/clip-gif.sh takeA.mp4 <start> 0 docs/media/cover.png 1000      # cover image: one frame with your face, the ghost and the pulse
scripts/clip-gif.sh takeA.mp4 <start> 0 docs/media/hud.png 1400        # debug overlay screenshot for "How It Responds to Human Signals"
```

The DEV cover image should be a still (`cover.png`), with `hook.gif` as the first thing in the post body. Keep each GIF under about 5 MB.

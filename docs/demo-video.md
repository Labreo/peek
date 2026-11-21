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

## Shot list (75 to 90 s cut, from PEEK_PLAN.md Section 17)

| Time | Shot | What must be visible |
|---|---|---|
| 0 to 10 s | **The hook.** Side view: your face lit by the lamp, lid half down. Cut to the screen: the pulse in the presenter view climbing. You blink, BLINK flashes, the ghost lurches. You drop the lid: game black, presenter view shows EYES SHUT, footsteps | Real person, real lid, live pulse |
| 10 to 20 s | Title card "Peek: your laptop lid is your eyelids". A slow pan of the rig: the Pixel propped as the eye, one cable | The Pixel is the camera |
| 20 to 35 s | Consent screen, camera check (pulse appearing), lid calibration (side view of you tilting the lid), baseline ring. Sped up | Consent first, Presage signals arriving |
| 35 to 60 s | Gameplay, split between side view and screen: squint and a message appears; a blink costs a step; lower the lid and the footsteps get close; hold your breath and "It has lost you"; a chapter 2 blackout | Each signal driving one mechanic, debug overlay visible |
| 60 to 75 s | The steady ending: lid open, you looking at it, pulse falling toward baseline in the presenter view, the lights come on | Pulse control |
| 75 to 90 s | Debrief chart, then a quick scroll of `src/main/presage.ts` and `src/main/lid.ts` | The integration code |

Also film a longer cut (the full 3 chapters, about 10 minutes) if you want a full playthrough link in the post.

**Backup:** if hardware fails on the day, record `npm run replay` with the presenter view (it shows "no live camera (replay)") and say clearly in the video that it is a recorded run.

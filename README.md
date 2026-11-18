# Peek

**A horror game where your MacBook lid is your eyelids.**

Close the lid partway to squint at the room, or shut it to hide. A ghost, the Archivist, moves when you blink, rushes in when you shut your eyes, and gets faster as your pulse climbs. The only way out is to look at it and calm down.

Your phone, propped beside the laptop, is the eye that watches you. The [Presage SmartSpectra SDK](https://github.com/Presage-Security/SmartSpectra) reads your pulse, breathing and blinks from that camera, so closing the lid never breaks sensing.

Built for the [Presage SmartSpectra SDK Challenge on DEV](https://dev.to/challenges/presage-2026-11-04).

> This is a game, not a health tool. It does not diagnose or measure anything about your health.

## How your body drives the game

| Signal | Source | What it does in the game |
|---|---|---|
| Lid angle | MacBook hinge sensor (HID) | Open = watching, the ghost is frozen. Tilt down = squint: writing on the walls appears, but the ghost creeps. Shut = eyes closed: black screen, it rushes in |
| Blink | Presage `BLINKING` | Each blink while watching lets the ghost lurch one step |
| Pulse | Presage `PULSE_RATE` | The further above your calm baseline, the faster it moves. To win you must bring it back down |
| Breathing | Presage breathing trace | Hold your breath when it is close and it loses you (capped at 8 s, then it leaves anyway) |

## Requirements

- A MacBook with Apple Silicon **M2 or newer** for the lid sensor (tested on M3). On other Macs the arrow keys act as the lid.
- macOS, Node.js 20 or newer.
- A camera that can see your face while the lid is shut. Best: an **Android 14+ phone in USB webcam mode** (tested setup: Pixel 8a). Any external webcam works too. The built-in camera works for trying it out, but it goes blind when you shut the lid (the game pauses).
- A **USB 2.0** USB-C cable for the phone. Android's docs list a known issue with USB 3 cables and macOS webcam mode.
- A soft desk lamp facing you. The game is dark; Presage needs to see your face.
- Headphones, strongly recommended.
- A free Presage API key from [physiology.presagetech.com](https://physiology.presagetech.com/).

## Setup

```bash
git clone https://github.com/Labreo/peek.git
cd peek
npm install
cp .env.example .env      # then put your key in .env: PRESAGE_API_KEY=...
npm start
```

Phone as webcam: plug the phone in, tap the USB notification on the phone, choose **Webcam**. Prop it at face height about an arm's length away. In Peek's camera check, pick it from the camera list.

macOS asks for camera permission the first time. If you launch from a terminal, the permission is granted to that terminal app.

### Other ways to run

```bash
npm run replay                       # watch a recorded run: no camera, no key, no lid sensor needed
npm run replay -- path/to/run.jsonl  # replay any saved run file
npm run sim                          # play with the arrow keys as the lid
npm run dev                          # start with the debug overlay on
npm test                             # unit tests (signal bus, game model, replay determinism)
```

### Keys

- `Space` or `Esc`: stop at any time
- `D`: debug overlay with the raw Presage values
- `M`: heartbeat sound on or off
- `F` (intro screen): flashing light on or off
- Arrow keys: the lid, when no lid sensor is found

## How it works

```
Phone (USB webcam) ──> getUserMedia (renderer) ──> @smartspectra/node-sdk/renderer
                                                         │ frames over IPC
                                                         v
                      Electron main: @smartspectra/node-sdk (native, on this Mac)
                                                         │ metrics: pulse, breathing trace, blinks
MacBook hinge ──> node-hid (main, 30 Hz) ──> IPC ──┐     v
                                                   └──> SignalBus (renderer) ──> game model ──> Three.js + Web Audio
```

- [`src/renderer/presage.ts`](src/renderer/presage.ts): the SmartSpectra integration. Requests breathing, `PULSE_RATE` and `BLINKING`, turns off telemetry, decodes each metrics packet into events.
- [`src/main/lid.ts`](src/main/lid.ts): reads the hinge angle (HID usage page `0x20`, usage `0x8A`, feature report 1).
- [`src/shared/signalBus.ts`](src/shared/signalBus.ts): filtering. Stable-only pulse with an EMA, a 4 s rolling breathing amplitude for breath-hold detection, edge-triggered blinks with a 250 ms refractory period, a median-filtered lid with 3 degrees of hysteresis.
- [`src/renderer/game/model.ts`](src/renderer/game/model.ts): the ghost movement rules. All constants live in [`tuning.ts`](src/renderer/game/tuning.ts).
- [`src/renderer/app.ts`](src/renderer/app.ts): the state machine (consent, camera check, lid calibration, 60 s calm baseline, play, debrief).

Before play you calibrate your lid (your usual open angle and your squint floor) and sit through a 60 s calm baseline that sets your resting pulse and normal breathing amplitude. Every threshold is relative to you.

## Consent and data handling

- **Consent:** a plain-language consent screen comes before any camera access. The camera starts only after "I agree". A camera-on indicator stays in the corner.
- **Processing:** all video is processed on your computer by the SmartSpectra SDK. No video is recorded or saved. Peek never requests image output from the SDK.
- **Storage:** readings are kept in memory during the session only.
- **Sharing:** none. Peek uploads nothing.
- **Retention:** cleared when you quit. A run file is only written if you press "Save run file" on the debrief screen; it goes to `~/Documents/Peek/runs/` on your own computer.
- **Deletion:** quitting clears memory. "Delete my data" on the debrief screen clears this session's readings and deletes every run file Peek created.
- **SDK telemetry:** Presage's diagnostic telemetry is turned off (`enableTelemetry: false`). Per Presage's [Telemetry and Privacy doc](https://github.com/Presage-Security/SmartSpectra/blob/main/docs/telemetry-and-privacy.md), when disabled "the SDK starts no telemetry session and transmits nothing" for telemetry. The SDK still contacts Presage's servers to authenticate the API key.
- **AI services:** none.
- **Who is measured:** only the person at the computer. Peek is not designed to measure anyone else.

## Safety

- Content note before play: one jump scare (under 1.5 s, volume capped) and flickering light. Flashing can be turned off.
- Breath holding stops working after 8 s and the ghost leaves anyway, so there is never a reason to hold longer. The game shows "Breathe normally."
- No mechanic rewards a higher heart rate.
- `Space` or `Esc` stops the game at any time.

## Troubleshooting

- **"Lid sensor not found":** the hinge sensor needs an M2 or newer MacBook. Use the arrow keys instead.
- **Phone not in the camera list:** use a USB 2.0 cable, unlock the phone, choose Webcam in the USB notification, then reopen the camera dropdown.
- **Pulse never stabilizes:** add light on your face, sit still, move the phone to arm's length. After 30 s you can continue without a stable pulse.
- **Game pauses when the lid is shut:** your camera is the laptop's own. Use the phone.

## Credits

See [CREDITS.md](CREDITS.md). Inspired by *Nevermind* (biofeedback horror) and Sam Henri Gold's LidAngleSensor.

## License

MIT for Peek's own code. The SmartSpectra SDK is under Presage's own license.

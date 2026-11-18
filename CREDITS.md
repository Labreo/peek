# Credits

## Sensing

- **Presage SmartSpectra SDK** (`@smartspectra/node-sdk`), Presage Technologies. Pulse, breathing and blink measurement. Peek's Electron setup follows Presage's `electron-quickstart` sample.
- **LidAngleSensor** by Sam Henri Gold, https://github.com/samhenrigold/LidAngleSensor. The HID usage page, usage, report ID and byte layout for the MacBook hinge sensor come from this project.
- **node-hid**, https://github.com/node-hid/node-hid. Reads the hinge sensor.

## Rendering and tooling

- **Three.js**, https://threejs.org (MIT).
- **Electron**, **esbuild**, **TypeScript**, **Vitest**.

## Assets

None. The room, the Archivist and every sound are generated in code (Three.js primitives, GLSL shaders and Web Audio synthesis), so there are no third-party art or audio assets.

## Inspiration

- **Nevermind** (Flying Mollusk, 2015), a biofeedback horror game that gets harder as your heart rate rises. Peek's new parts: the laptop hinge as eyelids, blinks as the ghost's movement trigger, breath holding to hide, and a phone as the sensing eye so the lid can close.
- The "only moves when you are not looking" idea is a long-standing horror trope.

## Development

Built with help from Claude Code (AI coding assistant).

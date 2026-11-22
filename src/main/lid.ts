// MacBook lid angle reader.
// The hinge sensor is an Apple HID device: usage page 0x20, usage 0x8A.
// Feature report ID 1; the angle in degrees is a little-endian uint16 at bytes 1..2
// (layout taken from LidAngleSensor by Sam Henri Gold). No sudo needed.

import type { LidSource } from '../shared/types';

export interface LidReader {
  source: LidSource;
  error: string | null;
  stop(): void;
}

const POLL_HZ = 30;

export function startLid(onDeg: (deg: number) => void, forceSim = false): LidReader {
  if (forceSim) return { source: 'simulator', error: 'Lid simulator forced with --sim-lid.', stop() {} };

  let HID: typeof import('node-hid');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    HID = require('node-hid');
  } catch (e) {
    return { source: 'simulator', error: `node-hid failed to load: ${(e as Error).message}`, stop() {} };
  }

  const info = HID.devices().find((d) => d.vendorId === 0x05ac && d.usagePage === 0x20 && d.usage === 0x8a);
  if (!info?.path) {
    return { source: 'simulator', error: "This Mac's lid sensor was not found (needs an M2 or newer MacBook).", stop() {} };
  }

  let dev: InstanceType<typeof HID.HID>;
  try {
    dev = new HID.HID(info.path);
  } catch (e) {
    return { source: 'simulator', error: `Could not open the lid sensor: ${(e as Error).message}`, stop() {} };
  }

  let failures = 0;
  const timer = setInterval(() => {
    try {
      const r = dev.getFeatureReport(1, 8);
      if (r.length >= 3) {
        onDeg(r[1] | (r[2] << 8));
        failures = 0;
      }
    } catch {
      if (++failures > 60) clearInterval(timer);
    }
  }, 1000 / POLL_HZ);

  return {
    source: 'sensor',
    error: null,
    stop() {
      clearInterval(timer);
      try { dev.close(); } catch { /* already closed */ }
    },
  };
}

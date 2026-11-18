// Checks that PRESAGE_API_KEY authenticates, without a camera: pushes blank frames
// through a custom input for a few seconds and reports SDK status and errors.
require('fs').readFileSync('.env', 'utf8').split('\n').forEach((l) => { const m = l.match(/^(\w+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });
const s = require('@smartspectra/node-sdk');
const sdk = new s.SmartSpectraSDK({ apiKey: process.env.PRESAGE_API_KEY, enableTelemetry: false,
  requestedMetrics: [...s.breathingMetrics, s.MetricType.PULSE_RATE, s.MetricType.BLINKING] });
const names = Object.fromEntries(Object.entries(s.ValidationCode).map(([k, v]) => [v, k]));
let errored = false;
sdk.on('processingStatus', (st) => console.log('status', st));
sdk.on('validationStatus', (c) => console.log('validation', names[c]));
sdk.on('error', (c, m) => { errored = true; console.log('ERROR', c, m); });
sdk.useCustomInput();
try { sdk.start(); } catch (e) { console.log('start threw', e.code, e.message); process.exit(1); }
const w = 640, h = 480, buf = Buffer.alloc(w * h * 3, 90);
let n = 0; const t0 = Date.now();
const iv = setInterval(() => {
  sdk.sendFrame(buf, w, h, w * 3, s.PixelFormat.kRGB, (Date.now() - t0) * 1000 + 1);
  if (++n >= 150) {
    clearInterval(iv);
    sdk.stopAsync().then(() => sdk.destroy()).then(() => { console.log(errored ? 'KEY CHECK: errors above' : 'KEY CHECK: ok, no auth errors'); process.exit(0); });
  }
}, 33);

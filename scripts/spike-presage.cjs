// Day 0 spike: log every Presage field for N seconds.
require('fs').readFileSync('.env','utf8').split('\n').forEach(l=>{const m=l.match(/^(\w+)=(.*)$/);if(m)process.env[m[1]]=m[2];});
const fs = require('fs');
const s = require('@smartspectra/node-sdk');
const { decodeMetrics: dm } = require('@smartspectra/node-sdk/messages');
const secs = Number(process.argv[2] || 45);
const camName = process.argv[3] || 'FaceTime';
const cam = s.SmartSpectraSDK.availableCameras().find(c => (c.name||'').includes(camName));
console.log('camera', cam);
const sdk = new s.SmartSpectraSDK({ apiKey: process.env.PRESAGE_API_KEY, enableTelemetry: false,
  requestedMetrics: [...s.breathingMetrics, ...s.cardioMetrics, ...s.faceMetrics] });
const out = fs.createWriteStream('scripts/spike-out.jsonl');
const V = Object.fromEntries(Object.entries(s.ValidationCode).map(([k,v])=>[v,k]));
sdk.on('processingStatus', st => console.log('status', st));
sdk.on('validationStatus', (c, ts, h) => console.log('validation', V[c], h));
sdk.on('error', (c, m, r) => console.log('ERROR', c, m, r));
let n = 0;
sdk.on('metrics', (buf, ts) => {
  const m = dm(buf); const o = m.toJSON ? m.toJSON() : m;
  out.write(JSON.stringify({ ts, m: o }) + '\n');
  if (n++ % 15 === 0) {
    const short = JSON.stringify(o, (k, v) => (k === 'landmarks' || k==='value' && Array.isArray(v)) ? '[..]' : v).slice(0, 900);
    console.log('metrics', short);
  }
});
sdk.useCamera(s.CameraSelection.byId(cam.id), { width: 1280, height: 720, fps: 30 });
sdk.start();
setTimeout(async () => { await sdk.stopAsync(); await sdk.destroy(); out.end(); console.log('packets', n); process.exit(0); }, secs * 1000);
